//! `QueryHandler` is the shape of every read use case (the "Q" of CQRS).
//!
//! A query never changes state. It asks a queries port for a read model and returns it. Because
//! it does not go through aggregates, the read side can be shaped for the screen, denormalized,
//! cached or served from a different store than the write side (ADR 5).
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

use crate::execution_context::{ExecutionContext, panic_message};

pub trait QueryHandler: Send + Sync + 'static {
    /// The query parameters; `()` when there are none.
    type Params: Send;
    /// The read model it answers with.
    type Output: Send;

    /// Authorization hook. Override it to refuse callers who may not run this query. Which rows
    /// they may see is the query's own business, in `execute()`.
    fn guard(&self, _params: &Self::Params, _context: &ExecutionContext) -> impl Future<Output = DomainResult> + Send {
        async { Ok(()) }
    }

    /// The read. Implement it in each concrete handler.
    fn execute(
        &self,
        params: Self::Params,
        context: &ExecutionContext,
    ) -> impl Future<Output = DomainResult<Self::Output>> + Send;

    /// What a controller calls: the log, the guard, the read, the safety net. Not meant to be overridden.
    fn handle(
        &self,
        params: Self::Params,
        context: &ExecutionContext,
    ) -> impl Future<Output = DomainResult<Self::Output>> + Send {
        async move {
            let name = type_name::<Self>();
            if let Some(logger) = context.logger() {
                logger.debug(context.trace_id(), &format!("Executing {name}"));
            }
            if let Err(refusal) = self.guard(&params, context).await {
                if let Some(logger) = context.logger() {
                    logger.warn(context.trace_id(), &format!("{name} refused: {}", refusal.message()));
                }
                return Err(refusal);
            }
            match AssertUnwindSafe(self.execute(params, context)).catch_unwind().await {
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
