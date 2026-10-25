//! Where the archiving of a note leaves its context. The handler owns the translation from the
//! Notes vocabulary (`NoteEvent::Archived`, internal) to the published one
//! (`NoteIntegrationEvent::Archived`, shared kernel), so that the people the note was shared
//! with can be told it is no longer available. Nothing else about Notes crosses the border.

use architecture_application::{EventHandler, ExecutionContext};
use architecture_domain::DomainResult;
use notes_domain::note::NoteEvent;
use shared_kernel_application::integration_events::note_integration_events::NoteIntegrationEvent;

pub struct NoteArchivedHandler;

impl EventHandler for NoteArchivedHandler {
    type Event = NoteEvent;

    async fn execute(&self, event: NoteEvent, context: &ExecutionContext) -> DomainResult {
        // The channel is NoteArchived, so this is the fact that arrives; any other is not this handler's.
        let NoteEvent::Archived { note_id, title, owner_id, recipient_ids } = event else {
            return Ok(());
        };
        if let Some(logger) = context.logger() {
            logger.debug(
                context.trace_id(),
                &format!("Note {note_id} archived by {owner_id}, shared with {} account(s)", recipient_ids.len()),
            );
        }

        // Published whenever the fact happens, whether or not anyone had access: the consumer fans out.
        context.publish(NoteIntegrationEvent::Archived { note_id, title, owner_id, recipient_ids }).await;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use architecture_application::{Auth, EventBus, EventSubscriber, ExecutionContextOptions};
    use architecture_infrastructure::InMemoryEventBus;

    use super::*;

    #[derive(Default)]
    struct Published(Mutex<Vec<NoteIntegrationEvent>>);
    impl EventHandler for Published {
        type Event = NoteIntegrationEvent;
        async fn execute(&self, event: NoteIntegrationEvent, _: &ExecutionContext) -> DomainResult {
            self.0.lock().unwrap().push(event);
            Ok(())
        }
    }

    #[test]
    fn republishes_the_domain_event_as_the_integration_event_other_contexts_subscribe_to() {
        let bus = Arc::new(InMemoryEventBus::new());
        let published = Arc::new(EventSubscriber(Published::default()));
        pollster::block_on(bus.subscribe(NoteIntegrationEvent::ARCHIVED, published.clone()));
        let context = ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::anonymous(),
            event_bus: bus,
            unit_of_work: None,
            logger: None,
        });

        pollster::block_on(NoteArchivedHandler.execute(
            NoteEvent::Archived {
                note_id: "note-1".into(),
                title: "Groceries".into(),
                owner_id: "alice".into(),
                recipient_ids: vec!["bob".into(), "carol".into()],
            },
            &context,
        ))
        .expect("reacted");

        assert_eq!(
            *published.0.0.lock().unwrap(),
            [NoteIntegrationEvent::Archived {
                note_id: "note-1".into(),
                title: "Groceries".into(),
                owner_id: "alice".into(),
                recipient_ids: vec!["bob".into(), "carol".into()],
            }]
        );
    }
}
