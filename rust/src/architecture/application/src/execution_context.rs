//! `ExecutionContext` travels with one request through every handler it reaches: who is calling
//! (`auth`: a subject id and a role, as strings — which roles exist is the shared kernel's
//! business, not the mechanics'), how to correlate the logs (`trace_id`), and the services a use
//! case may need without owning them (`logger`, `event_bus`, `unit_of_work`). That is the whole
//! list, on purpose: each member exists per request. Anything a handler needs that does not (a
//! mailer, a clock, a model client) is a constructor dependency, so that the handler's needs stay
//! in its signature and the context does not become a service locator (ARCH-EXECUTION-CONTEXT).
//!
//! The bootstrap builds one per request; tests build one by hand with [`ExecutionContext::new`].
//! A handler reads `context.auth()` to know the caller and passes `context` on when it publishes.
//! `with_transaction()`, `before_commit()` and `after_commit()` are what make "durable, then
//! published" possible: the events are appended to the unit of work's outbox at commit and
//! relayed after it (ADR 3, ADR 24). The context is shared by `Arc`: a clone is the same
//! context, which is how what is deferred until the commit can still publish on the same bus.

use std::future::Future;
use std::panic::AssertUnwindSafe;
use std::sync::{Arc, Mutex};

use futures::FutureExt;

use architecture_domain::{DomainResult, Event, Exception};

use crate::BoxFuture;
use crate::event_bus::{AnyEvent, EventBus};
use crate::operation::Operation;
use crate::outbox::{Outbox, relay_outbox};

/// The transaction boundary of the store a context writes to.
pub trait UnitOfWork: Send + Sync {
    fn begin_transaction(&self) -> BoxFuture<'_, ()>;
    fn commit_transaction(&self) -> BoxFuture<'_, ()>;
    fn rollback_transaction(&self) -> BoxFuture<'_, ()>;
    /// Whether a transaction is open. The context owns its transaction: it asks this before
    /// opening one, and a transaction already open there is a programming error, not one to join.
    fn has_active_transaction(&self) -> bool;
    /// The transactional outbox: what this transaction makes durable to be published after it commits (ADR 24).
    fn outbox(&self) -> &dyn Outbox;
}

/// Where a handler logs; every line carries the trace id of its request.
pub trait Logger: Send + Sync {
    fn info(&self, trace_id: &str, message: &str);
    fn warn(&self, trace_id: &str, message: &str);
    fn error(&self, trace_id: &str, message: &str, error: &str);
    fn debug(&self, trace_id: &str, message: &str);
}

/// Who is calling: the subject's id and role, both absent for an anonymous request.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Auth {
    pub subject_id: Option<String>,
    pub role: Option<String>,
}

impl Auth {
    pub fn anonymous() -> Self {
        Self::default()
    }

    pub fn of(subject_id: &str, role: &str) -> Self {
        Self { subject_id: Some(subject_id.to_string()), role: Some(role.to_string()) }
    }
}

pub struct ExecutionContextOptions {
    pub trace_id: String,
    pub auth: Auth,
    pub event_bus: Arc<dyn EventBus>,
    pub unit_of_work: Option<Arc<dyn UnitOfWork>>,
    pub logger: Option<Arc<dyn Logger>>,
}

struct State {
    in_transaction: bool,
    before_commit: Vec<BoxFuture<'static, ()>>,
    after_commit: Vec<BoxFuture<'static, ()>>,
}

struct Inner {
    trace_id: String,
    auth: Auth,
    event_bus: Arc<dyn EventBus>,
    unit_of_work: Option<Arc<dyn UnitOfWork>>,
    logger: Option<Arc<dyn Logger>>,
    state: Mutex<State>,
}

#[derive(Clone)]
pub struct ExecutionContext(Arc<Inner>);

impl ExecutionContext {
    pub fn new(options: ExecutionContextOptions) -> Self {
        Self(Arc::new(Inner {
            trace_id: options.trace_id,
            auth: options.auth,
            event_bus: options.event_bus,
            unit_of_work: options.unit_of_work,
            logger: options.logger,
            state: Mutex::new(State { in_transaction: false, before_commit: Vec::new(), after_commit: Vec::new() }),
        }))
    }

    pub fn trace_id(&self) -> &str {
        &self.0.trace_id
    }

    pub fn auth(&self) -> &Auth {
        &self.0.auth
    }

    pub fn event_bus(&self) -> &Arc<dyn EventBus> {
        &self.0.event_bus
    }

    pub fn unit_of_work(&self) -> Option<&Arc<dyn UnitOfWork>> {
        self.0.unit_of_work.as_ref()
    }

    pub fn logger(&self) -> Option<&Arc<dyn Logger>> {
        self.0.logger.as_ref()
    }

    /// Publishes an event on this request's bus, with this context: what a handler calls.
    pub async fn publish<E: Event + Send + Sync + 'static>(&self, event: E) -> Operation {
        self.0.event_bus.publish(Arc::new(event), self.clone()).await
    }

    /// Publishes a message under a given id, with this context: what the outbox relay calls,
    /// with the entry's id, so that the bus can recognise a message it already delivered.
    pub async fn publish_with_id(&self, event: Arc<dyn AnyEvent>, message_id: String) -> Operation {
        self.0.event_bus.publish_with_id(message_id, event, self.clone()).await
    }

    /// Runs `work` inside the unit of work when there is one: the `before_commit` steps
    /// registered during `work` run inside the transaction once `work` has succeeded (the
    /// outbox is written there), then the transaction commits, then the outbox is relayed
    /// through the bus, then the `after_commit` callbacks run. A failed result or a panic rolls
    /// back and drops every step and callback — whatever the failure, so a context is clean for
    /// its next transaction even after a unit of work that could not begin or roll back. Nested
    /// calls join the outer transaction: everything happens at the outermost one. The context
    /// owns that transaction: it opens it and closes it, and a unit of work that already has one
    /// open at the outermost call is a programming error (the steps and callbacks would otherwise
    /// run against a commit this context never sees), so it panics.
    pub async fn with_transaction<T, F, Fut>(&self, work: F) -> DomainResult<T>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = DomainResult<T>>,
    {
        let outermost = {
            let mut state = self.state();
            let outermost = !state.in_transaction;
            state.in_transaction = true;
            outermost
        };
        // Dropped on every way out of the outermost call, a panic of the unit of work included:
        // the context is then out of its transaction, with no step and no callback left over.
        let _clean = outermost.then(|| TransactionOver(self));

        let result = self.run_in_unit_of_work(work, outermost).await;

        if outermost && result.is_ok() {
            // The transaction is over before the relay and the callbacks run: a reaction they
            // publish opens its own transaction, and its own steps run at its own commit.
            let callbacks = {
                let mut state = self.state();
                state.in_transaction = false;
                std::mem::take(&mut state.after_commit)
            };
            self.relay().await;
            for callback in callbacks {
                callback.await;
            }
        }
        result
    }

    /// Runs `step` inside the current transaction, once the use case has succeeded and just
    /// before the commit: where `publish_domain_events()` appends the aggregate's events to the
    /// outbox, so that they are durable with the state they describe and gone with it on a
    /// rollback. Outside of any transaction (a reaction, which runs after the command that set
    /// it off committed) the step runs immediately, and the outbox is relayed at once: what it
    /// stored is published now, not at the next commit.
    pub async fn before_commit(&self, step: impl Future<Output = ()> + Send + 'static) {
        {
            let mut state = self.state();
            if state.in_transaction {
                state.before_commit.push(Box::pin(step));
                return;
            }
        }
        step.await;
        self.relay().await;
    }

    /// Defers `callback` until the current transaction is committed, so that its side effects
    /// (typically publishing domain events) never leak facts that end up rolled back. Outside of
    /// any transaction the callback runs immediately.
    pub async fn after_commit(&self, callback: impl Future<Output = ()> + Send + 'static) {
        {
            let mut state = self.state();
            if state.in_transaction {
                state.after_commit.push(Box::pin(callback));
                return;
            }
        }
        callback.await;
    }

    /// What the unit of work made durable goes out now, through this request's bus (ADR 24);
    /// nothing to relay without a unit of work, since there is no outbox.
    async fn relay(&self) {
        if let Some(unit_of_work) = &self.0.unit_of_work {
            relay_outbox(unit_of_work.outbox(), self).await;
        }
    }

    /// The `before_commit` steps, inside the transaction, once the outermost use case has succeeded.
    async fn run_before_commit(&self) -> DomainResult {
        let steps = std::mem::take(&mut self.state().before_commit);
        for step in steps {
            step.await;
        }
        Ok(())
    }

    async fn run_in_unit_of_work<T, F, Fut>(&self, work: F, outermost: bool) -> DomainResult<T>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = DomainResult<T>>,
    {
        let Some(unit_of_work) = &self.0.unit_of_work else {
            let value = self.guarded(work()).await?;
            if outermost {
                self.guarded(self.run_before_commit()).await?;
            }
            return Ok(value);
        };

        if outermost {
            // Outside the safety net on purpose: a transaction somebody else opened is a
            // programming error, not an outcome of the use case (DOMAIN-RESULT).
            if unit_of_work.has_active_transaction() {
                panic!(
                    "The unit of work already has a transaction open: the context owns its transaction and opens it itself, nothing else may begin one"
                );
            }
            unit_of_work.begin_transaction().await;
        }

        let result = self.guarded(work()).await;
        if !outermost {
            return result;
        }

        let value = match result {
            Ok(value) => value,
            Err(exception) => {
                unit_of_work.rollback_transaction().await;
                return Err(exception);
            }
        };

        // The `before_commit` steps and the commit, under the same safety net as the use case: a
        // step or a commit that panics fails the transaction like the use case would have.
        let committed = self
            .guarded(async {
                self.run_before_commit().await?;
                unit_of_work.commit_transaction().await;
                Ok(())
            })
            .await;
        match committed {
            Ok(()) => Ok(value),
            Err(exception) => {
                unit_of_work.rollback_transaction().await;
                Err(exception)
            }
        }
    }

    /// The safety net: a panic inside the work becomes a failed result instead of a crash.
    async fn guarded<T>(&self, work: impl Future<Output = DomainResult<T>>) -> DomainResult<T> {
        match AssertUnwindSafe(work).catch_unwind().await {
            Ok(result) => result,
            Err(payload) => {
                let message = panic_message(payload.as_ref());
                if let Some(logger) = &self.0.logger {
                    logger.error(&self.0.trace_id, "Transaction failed", &message);
                }
                Err(Exception::unknown(message))
            }
        }
    }

    fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.0.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

/// The end of the outermost transaction, however it ended: what a `finally` would do. Dropping
/// it takes the context out of its transaction and drops every step and callback still
/// registered, so that nothing of a failed transaction reaches the next one.
struct TransactionOver<'a>(&'a ExecutionContext);

impl Drop for TransactionOver<'_> {
    fn drop(&mut self) {
        let mut state = self.0.state();
        state.in_transaction = false;
        state.before_commit.clear();
        state.after_commit.clear();
    }
}

/// What a panic said, as text; a `panic!("…")` payload is a `&str` or a `String`.
pub fn panic_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(text) = payload.downcast_ref::<&str>() {
        (*text).to_string()
    } else if let Some(text) = payload.downcast_ref::<String>() {
        text.clone()
    } else {
        "unexpected panic".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event_bus::AnyHandler;
    use crate::outbox::testing::FakeOutbox;
    use architecture_domain::EventKind;

    /// What a relayed entry carries here: a fact with a name, nothing more.
    #[derive(Debug, Clone, PartialEq)]
    struct Fact;
    impl Event for Fact {
        fn name(&self) -> &'static str {
            "Fact"
        }
        fn kind(&self) -> EventKind {
            EventKind::Domain
        }
    }

    /// Records the order of things, so the tests can see what happened before what: the
    /// transaction's steps and, through the bus that shares its log, what was published.
    #[derive(Default)]
    struct RecordingUnitOfWork {
        log: Arc<Mutex<Vec<&'static str>>>,
        active: Mutex<bool>,
        /// A rollback that panics after it ran: the connection gone, as a store would report it.
        rollback_fails: Mutex<bool>,
        outbox: FakeOutbox,
    }
    impl RecordingUnitOfWork {
        fn log(&self, entry: &'static str) {
            self.log.lock().unwrap().push(entry);
        }
        fn entries(&self) -> Vec<&'static str> {
            self.log.lock().unwrap().clone()
        }
    }
    impl UnitOfWork for RecordingUnitOfWork {
        fn begin_transaction(&self) -> BoxFuture<'_, ()> {
            *self.active.lock().unwrap() = true;
            self.log("begin");
            Box::pin(async {})
        }
        fn commit_transaction(&self) -> BoxFuture<'_, ()> {
            *self.active.lock().unwrap() = false;
            self.log("commit");
            Box::pin(async {})
        }
        fn rollback_transaction(&self) -> BoxFuture<'_, ()> {
            *self.active.lock().unwrap() = false;
            self.log("rollback");
            assert!(!*self.rollback_fails.lock().unwrap(), "the connection is gone");
            Box::pin(async {})
        }
        fn has_active_transaction(&self) -> bool {
            *self.active.lock().unwrap()
        }
        fn outbox(&self) -> &dyn Outbox {
            &self.outbox
        }
    }

    /// Runs `work` to its end and hands back what it panicked with, if it did, as text.
    fn panic_of<T>(work: impl FnOnce() -> T) -> Option<String> {
        std::panic::catch_unwind(AssertUnwindSafe(work)).err().map(|payload| panic_message(payload.as_ref()))
    }

    /// A bus that writes "publish" in the unit of work's log and hands the operation back as it is.
    struct RecordingBus(Arc<Mutex<Vec<&'static str>>>);
    impl EventBus for RecordingBus {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn dispatch(&self, operation: Operation) -> BoxFuture<'_, Operation> {
            self.0.lock().unwrap().push("publish");
            Box::pin(async move { operation })
        }
        fn subscribe(&self, _channel: &'static str, _handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
    }

    fn context_with(unit_of_work: Option<Arc<RecordingUnitOfWork>>) -> ExecutionContext {
        let log = unit_of_work.as_ref().map(|uow| uow.log.clone()).unwrap_or_default();
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::anonymous(),
            event_bus: Arc::new(RecordingBus(log)),
            unit_of_work: unit_of_work.map(|uow| uow as Arc<dyn UnitOfWork>),
            logger: None,
        })
    }

    #[test]
    fn runs_the_callback_only_once_the_transaction_is_committed() {
        let uow = Arc::new(RecordingUnitOfWork::default());
        let context = context_with(Some(uow.clone()));

        pollster::block_on(context.with_transaction(|| async {
            let recorder = uow.clone();
            context.after_commit(async move { recorder.log("callback") }).await;
            uow.log("work");
            Ok(())
        }))
        .expect("committed");

        assert_eq!(uow.entries(), ["begin", "work", "commit", "callback"]);
    }

    #[test]
    fn runs_a_before_commit_step_inside_the_transaction_after_the_work_and_before_the_commit_then_relays_the_outbox() {
        let uow = Arc::new(RecordingUnitOfWork::default());
        let context = context_with(Some(uow.clone()));

        pollster::block_on(context.with_transaction(|| async {
            let recorder = uow.clone();
            context.after_commit(async move { recorder.log("callback") }).await;
            let recorder = uow.clone();
            context
                .before_commit(async move {
                    recorder.log("before commit");
                    recorder.outbox.append(vec![Arc::new(Fact)]).await;
                })
                .await;
            uow.log("work");
            Ok(())
        }))
        .expect("committed");

        assert_eq!(uow.entries(), ["begin", "work", "before commit", "commit", "publish", "callback"]);
        assert!(uow.outbox.entries().is_empty());
    }

    #[test]
    fn drops_the_before_commit_step_with_the_callback_when_the_transaction_fails() {
        let uow = Arc::new(RecordingUnitOfWork::default());
        let context = context_with(Some(uow.clone()));

        let result: DomainResult = pollster::block_on(context.with_transaction(|| async {
            let recorder = uow.clone();
            context.before_commit(async move { recorder.log("before commit") }).await;
            Err(Exception::unknown("nope"))
        }));

        assert!(result.is_err());
        assert_eq!(uow.entries(), ["begin", "rollback"]);
    }

    #[test]
    fn runs_a_before_commit_step_at_once_outside_any_transaction_and_relays_the_outbox_at_once() {
        let uow = Arc::new(RecordingUnitOfWork::default());
        let context = context_with(Some(uow.clone()));
        let recorder = uow.clone();

        pollster::block_on(context.before_commit(async move {
            recorder.log("step");
            recorder.outbox.append(vec![Arc::new(Fact)]).await;
        }));

        assert_eq!(uow.entries(), ["step", "publish"]);
        assert!(uow.outbox.entries().is_empty());
    }

    #[test]
    fn drops_the_callback_when_the_transaction_fails() {
        let uow = Arc::new(RecordingUnitOfWork::default());
        let context = context_with(Some(uow.clone()));

        let result: DomainResult = pollster::block_on(context.with_transaction(|| async {
            let recorder = uow.clone();
            context.after_commit(async move { recorder.log("callback") }).await;
            Err(Exception::unknown("nope"))
        }));

        assert!(result.is_err());
        assert_eq!(uow.entries(), ["begin", "rollback"]);
    }

    #[test]
    fn turns_a_panic_into_a_failed_result_and_rolls_back() {
        let uow = Arc::new(RecordingUnitOfWork::default());
        let context = context_with(Some(uow.clone()));

        let result: DomainResult = pollster::block_on(context.with_transaction(|| async {
            let recorder = uow.clone();
            context.after_commit(async move { recorder.log("callback") }).await;
            panic!("boom");
        }));

        assert_eq!(result.expect_err("a panic").message(), "boom");
        assert_eq!(uow.entries(), ["begin", "rollback"]);
    }

    #[test]
    fn keeps_nothing_from_a_transaction_whose_unit_of_work_could_not_roll_back_the_context_is_clean_for_the_next_one() {
        let uow = Arc::new(RecordingUnitOfWork::default());
        let context = context_with(Some(uow.clone()));
        *uow.rollback_fails.lock().unwrap() = true;

        let failure = panic_of(|| {
            pollster::block_on(context.with_transaction(|| async {
                let recorder = uow.clone();
                context.before_commit(async move { recorder.log("stale step") }).await;
                let recorder = uow.clone();
                context.after_commit(async move { recorder.log("stale callback") }).await;
                Err::<(), _>(Exception::unknown("refused"))
            }))
        });
        assert_eq!(failure.as_deref(), Some("the connection is gone"));

        *uow.rollback_fails.lock().unwrap() = false;
        pollster::block_on(context.with_transaction(|| async {
            let recorder = uow.clone();
            context.after_commit(async move { recorder.log("callback") }).await;
            Ok(())
        }))
        .expect("committed");

        assert_eq!(uow.entries(), ["begin", "rollback", "begin", "commit", "callback"]);
    }

    #[test]
    fn owns_its_transaction_a_unit_of_work_that_already_has_one_open_at_the_outermost_call_is_a_programming_error() {
        let uow = Arc::new(RecordingUnitOfWork::default());
        let context = context_with(Some(uow.clone()));
        *uow.active.lock().unwrap() = true;

        let failure = panic_of(|| {
            pollster::block_on(context.with_transaction(|| async {
                uow.log("work");
                Ok(())
            }))
        });
        assert!(failure.expect("a panic").contains("the context owns its transaction"));
        assert!(uow.entries().is_empty());

        *uow.active.lock().unwrap() = false;
        pollster::block_on(context.with_transaction(|| async { Ok(()) })).expect("committed");
        assert_eq!(uow.entries(), ["begin", "commit"]);
    }

    #[test]
    fn runs_the_callback_at_the_outermost_commit_when_transactions_are_nested() {
        let uow = Arc::new(RecordingUnitOfWork::default());
        let context = context_with(Some(uow.clone()));

        pollster::block_on(context.with_transaction(|| async {
            context
                .with_transaction(|| async {
                    let recorder = uow.clone();
                    context.after_commit(async move { recorder.log("inner callback") }).await;
                    Ok(())
                })
                .await?;
            uow.log("outer work");
            Ok(())
        }))
        .expect("committed");

        assert_eq!(uow.entries(), ["begin", "outer work", "commit", "inner callback"]);
    }

    #[test]
    fn runs_the_callback_immediately_outside_of_a_transaction() {
        let context = context_with(None);
        let ran = Arc::new(Mutex::new(false));
        let flag = ran.clone();

        pollster::block_on(context.after_commit(async move { *flag.lock().unwrap() = true }));

        assert!(*ran.lock().unwrap());
    }

    #[test]
    fn still_defers_the_callback_without_a_unit_of_work_until_the_work_succeeds() {
        let context = context_with(None);
        let order = Arc::new(Mutex::new(Vec::<&'static str>::new()));

        pollster::block_on(context.with_transaction(|| async {
            let log = order.clone();
            context.after_commit(async move { log.lock().unwrap().push("callback") }).await;
            order.lock().unwrap().push("work");
            Ok(())
        }))
        .expect("succeeded");

        assert_eq!(*order.lock().unwrap(), ["work", "callback"]);
    }
}
