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
//! `with_transaction()` and `after_commit()` are what make "publish after commit" possible
//! (ADR 3). The context is shared by `Arc`: a clone is the same context, which is how what is
//! deferred until the commit can still publish on the same bus.

use std::future::Future;
use std::panic::AssertUnwindSafe;
use std::sync::{Arc, Mutex};

use futures::FutureExt;

use architecture_domain::{DomainResult, Event, Exception};

use crate::BoxFuture;
use crate::event_bus::EventBus;
use crate::operation::Operation;

/// The transaction boundary of the store a context writes to.
pub trait UnitOfWork: Send + Sync {
    fn begin_transaction(&self) -> BoxFuture<'_, ()>;
    fn commit_transaction(&self) -> BoxFuture<'_, ()>;
    fn rollback_transaction(&self) -> BoxFuture<'_, ()>;
    fn has_active_transaction(&self) -> bool;
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
            state: Mutex::new(State { in_transaction: false, after_commit: Vec::new() }),
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

    /// Runs `work` inside the unit of work when there is one, then runs the `after_commit`
    /// callbacks registered during it once the transaction is committed. A failed result or a
    /// panic rolls back and drops those callbacks. Nested calls join the outer transaction.
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

        let result = self.run_in_unit_of_work(work).await;

        if outermost {
            // The transaction is over before the callbacks run: a reaction they publish opens
            // its own transaction, and its own callbacks run at its own commit.
            let callbacks = {
                let mut state = self.state();
                state.in_transaction = false;
                std::mem::take(&mut state.after_commit)
            };
            if result.is_ok() {
                for callback in callbacks {
                    callback.await;
                }
            }
        }
        result
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

    async fn run_in_unit_of_work<T, F, Fut>(&self, work: F) -> DomainResult<T>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = DomainResult<T>>,
    {
        let Some(unit_of_work) = &self.0.unit_of_work else {
            return self.guarded(work()).await;
        };

        let existing = unit_of_work.has_active_transaction();
        if !existing {
            unit_of_work.begin_transaction().await;
        }

        let result = self.guarded(work()).await;

        if !existing {
            match &result {
                Ok(_) => unit_of_work.commit_transaction().await,
                Err(_) => unit_of_work.rollback_transaction().await,
            }
        }
        result
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
    use crate::event_bus::{AnyEvent, AnyHandler};

    /// A bus nothing is published on here: the tests are about the context.
    struct NoBus;
    impl EventBus for NoBus {
        fn connect(&self) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
        fn publish(&self, _event: Arc<dyn AnyEvent>, _context: ExecutionContext) -> BoxFuture<'_, Operation> {
            unreachable!("not used")
        }
        fn subscribe(&self, _channel: &'static str, _handler: Arc<dyn AnyHandler>) -> BoxFuture<'_, ()> {
            Box::pin(async {})
        }
    }

    /// Records the order of things, so the tests can see what happened before what.
    #[derive(Default)]
    struct RecordingUnitOfWork {
        log: Mutex<Vec<&'static str>>,
        active: Mutex<bool>,
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
            Box::pin(async {})
        }
        fn has_active_transaction(&self) -> bool {
            *self.active.lock().unwrap()
        }
    }

    fn context_with(unit_of_work: Option<Arc<RecordingUnitOfWork>>) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::anonymous(),
            event_bus: Arc::new(NoBus),
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
