//! Where a domain event leaves its context. The handler owns the translation from the Notes
//! vocabulary (`NoteEvent::Shared`, internal) to the published one
//! (`NoteIntegrationEvent::Shared`, shared kernel). Nothing else about Notes crosses the border.
//! The fact goes out through the outbox, when the reaction's own transaction commits (ADR 30).

use architecture_application::{EventHandler, ExecutionContext, publish_integration_event};
use architecture_domain::DomainResult;
use notes_domain::note::NoteEvent;
use shared_kernel_application::integration_events::note_integration_events::NoteIntegrationEvent;

pub struct NoteSharedHandler;

impl EventHandler for NoteSharedHandler {
    type Event = NoteEvent;

    async fn execute(&self, event: NoteEvent, context: &ExecutionContext) -> DomainResult {
        // The channel is NoteShared, so this is the fact that arrives; any other is not this handler's.
        let NoteEvent::Shared { note_id, title, owner_id, recipient_id } = event else {
            return Ok(());
        };
        if let Some(logger) = context.logger() {
            logger.debug(context.trace_id(), &format!("Note {note_id} shared with {recipient_id}"));
        }

        publish_integration_event(NoteIntegrationEvent::Shared { note_id, title, owner_id, recipient_id }, context)
            .await;

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
        pollster::block_on(bus.subscribe(NoteIntegrationEvent::SHARED, published.clone()));
        let context = ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::anonymous(),
            event_bus: bus,
            unit_of_work: None,
            logger: None,
        });

        pollster::block_on(NoteSharedHandler.execute(
            NoteEvent::Shared {
                note_id: "note-1".into(),
                title: "Groceries".into(),
                owner_id: "alice".into(),
                recipient_id: "bob".into(),
            },
            &context,
        ))
        .expect("reacted");

        assert_eq!(
            *published.0.0.lock().unwrap(),
            [NoteIntegrationEvent::Shared {
                note_id: "note-1".into(),
                title: "Groceries".into(),
                owner_id: "alice".into(),
                recipient_id: "bob".into()
            }]
        );
    }
}
