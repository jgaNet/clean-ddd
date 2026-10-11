//! A reaction that only logs: the fact is recorded by the Tracker anyway, and a handler can be
//! given more to do later without touching the aggregate.

use architecture_application::{EventHandler, ExecutionContext};
use architecture_domain::DomainResult;
use notes_domain::note::NoteEvent;

pub struct NoteCreatedHandler;

impl EventHandler for NoteCreatedHandler {
    type Event = NoteEvent;

    async fn execute(&self, event: NoteEvent, context: &ExecutionContext) -> DomainResult {
        if let (NoteEvent::Created { note_id, owner_id, .. }, Some(logger)) = (&event, context.logger()) {
            logger.debug(context.trace_id(), &format!("Note {note_id} created by {owner_id}"));
        }
        Ok(())
    }
}
