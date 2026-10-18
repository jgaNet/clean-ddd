//! `QueryHandler` is the shape of every read use case (the "Q" of CQRS).
//!
//! A query never changes state. It asks a queries port for a read model and returns it. Because
//! it does not go through aggregates, the read side can be shaped for the screen, denormalized,
//! cached or served from a different store than the write side (ADR 5).
//!
//! A query is a struct, like a command: the question with its parameters (`GetNote { note_id }`,
//! or a unit struct when there are none), saying what it answers with through [`Query`]. The
//! handler is generic over the port it reads and names the query it answers; a controller finds
//! it in the module by the query's type (`module.query::<GetNote>()`), never by the handler's,
//! which would name the adapter (ADR 14).
//!
//! It mirrors `CommandHandler`: the provided `handle()` is what a controller calls, and does the
//! guard, the logging and the safety net once; a concrete handler only writes `execute()`. There
//! is no transaction and no operation: a query answers synchronously and is never put on the
//! bus. A handler holds the queries port it reads from as a field, taken in its constructor.

use std::any::type_name;
use std::future::Future;
use std::panic::AssertUnwindSafe;

use futures::FutureExt;

use architecture_domain::{DomainResult, Exception};

use crate::BoxFuture;
use crate::execution_context::{ExecutionContext, panic_message};

/// A question with its parameters, and the read model it answers with.
pub trait Query: Send + 'static {
    type Output: Send;
}

pub trait QueryHandler: Send + Sync + 'static {
    /// The query this handler answers.
    type Query: Query;

    /// Authorization hook. Override it to refuse callers who may not run this query. Which rows
    /// they may see is the query's own business, in `execute()`.
    fn guard(&self, _query: &Self::Query, _context: &ExecutionContext) -> impl Future<Output = DomainResult> + Send {
        async { Ok(()) }
    }

    /// The read. Implement it in each concrete handler.
    fn execute(
        &self,
        query: Self::Query,
        context: &ExecutionContext,
    ) -> impl Future<Output = DomainResult<<Self::Query as Query>::Output>> + Send;

    /// What a controller calls: the log, the guard, the read, the safety net. Not meant to be overridden.
    fn handle(
        &self,
        query: Self::Query,
        context: &ExecutionContext,
    ) -> impl Future<Output = DomainResult<<Self::Query as Query>::Output>> + Send {
        async move {
            let name = type_name::<Self::Query>().rsplit("::").next().unwrap_or("?");
            if let Some(logger) = context.logger() {
                logger.debug(context.trace_id(), &format!("Executing {name}"));
            }
            if let Err(refusal) = self.guard(&query, context).await {
                if let Some(logger) = context.logger() {
                    logger.warn(context.trace_id(), &format!("{name} refused: {}", refusal.message()));
                }
                return Err(refusal);
            }
            match AssertUnwindSafe(self.execute(query, context)).catch_unwind().await {
                Ok(result) => {
                    if let (Err(failure), Some(logger)) = (&result, context.logger()) {
                        logger.warn(context.trace_id(), &format!("{name} failed: {}", failure.message()));
                    }
                    result
                }
                Err(payload) => {
                    let message = panic_message(payload.as_ref());
                    if let Some(logger) = context.logger() {
                        logger.error(context.trace_id(), &format!("Unexpected error in {name}"), &message);
                    }
                    Err(Exception::unknown(message))
                }
            }
        }
    }
}

/// A query handler as the module holds it: whoever asks `Q` gets its answer, without knowing
/// which handler, over which adapter, answers it.
pub trait AnyQuery<Q: Query>: Send + Sync {
    fn handle<'a>(&'a self, query: Q, context: &'a ExecutionContext) -> BoxFuture<'a, DomainResult<Q::Output>>;
}

impl<H: QueryHandler> AnyQuery<H::Query> for H {
    fn handle<'a>(
        &'a self,
        query: H::Query,
        context: &'a ExecutionContext,
    ) -> BoxFuture<'a, DomainResult<<H::Query as Query>::Output>> {
        Box::pin(QueryHandler::handle(self, query, context))
    }
}
