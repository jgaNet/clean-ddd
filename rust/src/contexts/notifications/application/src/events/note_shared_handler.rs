//! Anti-corruption layer towards Notes: the recipient of a shared note is told, live.

use std::sync::Arc;

use architecture_application::{EventHandler, ExecutionContext};
use architecture_domain::DomainResult;
use notifications_domain::notification::ports::notification_repository::NotificationRepository;
use notifications_domain::notification::{Channel, Metadata, NewNotification};
use shared_kernel_application::integration_events::note_integration_events::NoteIntegrationEvent;

use crate::delivery::NotificationDelivery;

pub struct NoteSharedHandler<R> {
    delivery: Arc<NotificationDelivery<R>>,
}

impl<R> NoteSharedHandler<R> {
    pub fn new(delivery: Arc<NotificationDelivery<R>>) -> Self {
        Self { delivery }
    }
}

impl<R: NotificationRepository + Send + Sync + 'static> EventHandler for NoteSharedHandler<R> {
    type Event = NoteIntegrationEvent;

    async fn execute(&self, event: NoteIntegrationEvent, context: &ExecutionContext) -> DomainResult {
        let NoteIntegrationEvent::Shared { note_id, title, owner_id, recipient_id } = event;
        let metadata = Metadata::from([
            ("noteId".to_string(), note_id),
            ("sharedBy".to_string(), owner_id),
            ("source".to_string(), "Notes.NoteShared".to_string()),
        ]);
        self.delivery
            .deliver(
                NewNotification {
                    recipient_id,
                    title: format!("A note was shared with you: {title}"),
                    content: format!("You now have access to the note \"{title}\"."),
                    channels: vec![Channel::WebSocket],
                    metadata,
                },
                context,
            )
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use architecture_infrastructure::InMemoryDataSource;
    use notifications_infrastructure::InMemoryNotificationRepository;

    use super::*;
    use crate::delivery::tests::{FakeChannel, context};

    #[test]
    fn turns_the_notes_fact_into_a_live_notification_for_the_recipient_in_notifications_terms() {
        let websocket = FakeChannel::new(Channel::WebSocket);
        let store = Arc::new(InMemoryDataSource::new());
        let delivery = Arc::new(NotificationDelivery::new(
            Arc::new(InMemoryNotificationRepository::new(store.clone())),
            vec![websocket.clone()],
        ));

        pollster::block_on(NoteSharedHandler::new(delivery).execute(
            NoteIntegrationEvent::Shared {
                note_id: "note-1".into(),
                title: "Groceries".into(),
                owner_id: "alice".into(),
                recipient_id: "bob".into(),
            },
            &context(),
        ))
        .expect("reacted");

        let delivered = websocket.delivered();
        assert_eq!(delivered.len(), 1);
        assert_eq!(delivered[0].recipient_id, "bob");
        assert_eq!(delivered[0].title, "A note was shared with you: Groceries");
        assert_eq!(delivered[0].metadata.get("noteId").map(String::as_str), Some("note-1"));
        assert_eq!(delivered[0].metadata.get("source").map(String::as_str), Some("Notes.NoteShared"));
        let stored = &store.all()[0];
        assert_eq!((stored.recipient_id.as_str(), stored.channels.as_slice()), ("bob", &[Channel::WebSocket][..]));
    }
}
