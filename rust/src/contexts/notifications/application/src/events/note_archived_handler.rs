//! Anti-corruption layer towards Notes: the people a note was shared with are told, live, that
//! it is no longer available. One fact arrives with the whole list of recipients; the fan-out —
//! one notification each — is this context's business.

use std::sync::Arc;

use architecture_application::{EventHandler, ExecutionContext};
use architecture_domain::DomainResult;
use notifications_domain::notification::ports::notification_repository::NotificationRepository;
use notifications_domain::notification::{Channel, Metadata, NewNotification};
use shared_kernel_application::integration_events::note_integration_events::NoteIntegrationEvent;

use crate::delivery::NotificationDelivery;

pub struct NoteArchivedHandler<R> {
    delivery: Arc<NotificationDelivery<R>>,
}

impl<R> NoteArchivedHandler<R> {
    pub fn new(delivery: Arc<NotificationDelivery<R>>) -> Self {
        Self { delivery }
    }
}

impl<R: NotificationRepository + Send + Sync + 'static> EventHandler for NoteArchivedHandler<R> {
    type Event = NoteIntegrationEvent;

    async fn execute(&self, event: NoteIntegrationEvent, context: &ExecutionContext) -> DomainResult {
        let NoteIntegrationEvent::Archived { note_id, title, owner_id, recipient_ids } = event else {
            return Ok(());
        };
        for recipient_id in recipient_ids {
            let metadata = Metadata::from([
                ("noteId".to_string(), note_id.clone()),
                ("archivedBy".to_string(), owner_id.clone()),
                ("source".to_string(), "Notes.NoteArchived".to_string()),
            ]);
            self.delivery
                .deliver(
                    NewNotification {
                        recipient_id,
                        title: format!("A note shared with you is no longer available: {title}"),
                        content: format!(
                            "The note \"{title}\" was archived by its owner. You no longer have access to it."
                        ),
                        channels: vec![Channel::WebSocket],
                        metadata,
                    },
                    context,
                )
                .await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use architecture_infrastructure::InMemoryDataSource;
    use notifications_infrastructure::InMemoryNotificationRepository;

    use super::*;
    use crate::delivery::tests::{FakeChannel, context};

    fn archived(recipient_ids: Vec<String>) -> NoteIntegrationEvent {
        NoteIntegrationEvent::Archived {
            note_id: "note-1".into(),
            title: "Groceries".into(),
            owner_id: "alice".into(),
            recipient_ids,
        }
    }

    #[test]
    fn tells_every_recipient_of_the_note_live_in_notifications_terms() {
        let websocket = FakeChannel::new(Channel::WebSocket);
        let store = Arc::new(InMemoryDataSource::new());
        let delivery = Arc::new(NotificationDelivery::new(
            Arc::new(InMemoryNotificationRepository::new(store.clone())),
            vec![websocket.clone()],
        ));

        pollster::block_on(
            NoteArchivedHandler::new(delivery).execute(archived(vec!["bob".into(), "carol".into()]), &context()),
        )
        .expect("reacted");

        let delivered = websocket.delivered();
        assert_eq!(delivered.iter().map(|d| d.recipient_id.as_str()).collect::<Vec<_>>(), ["bob", "carol"]);
        assert_eq!(delivered[0].title, "A note shared with you is no longer available: Groceries");
        assert_eq!(delivered[0].metadata.get("noteId").map(String::as_str), Some("note-1"));
        assert_eq!(delivered[0].metadata.get("archivedBy").map(String::as_str), Some("alice"));
        assert_eq!(delivered[0].metadata.get("source").map(String::as_str), Some("Notes.NoteArchived"));
        let stored = store.all();
        assert_eq!(stored.len(), 2);
        assert_eq!(
            (stored[0].recipient_id.as_str(), stored[0].channels.as_slice()),
            ("bob", &[Channel::WebSocket][..])
        );
    }

    #[test]
    fn tells_nobody_when_the_note_was_shared_with_nobody() {
        let websocket = FakeChannel::new(Channel::WebSocket);
        let store = Arc::new(InMemoryDataSource::new());
        let delivery = Arc::new(NotificationDelivery::new(
            Arc::new(InMemoryNotificationRepository::new(store.clone())),
            vec![websocket.clone()],
        ));

        pollster::block_on(NoteArchivedHandler::new(delivery).execute(archived(vec![]), &context())).expect("reacted");

        assert!(websocket.delivered().is_empty());
        assert!(store.is_empty());
    }
}
