//! The commands of the Notifications context: a notification sent by hand, and one marked read.

pub mod mark_as_read;
pub mod send_notification;

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use architecture_application::{Auth, CommandHandler, ExecutionContext, ExecutionContextOptions};
    use architecture_domain::common_exceptions::NOT_ALLOWED;
    use architecture_infrastructure::{InMemoryDataSource, InMemoryEventBus};
    use notifications_domain::notification::notification_exceptions::{
        NOTIFICATION_ALREADY_READ, NOTIFICATION_NOT_FOUND,
    };
    use notifications_domain::notification::{Channel, Metadata, NotificationStatus};
    use notifications_infrastructure::InMemoryNotificationRepository;

    use super::mark_as_read::{MarkAsRead, MarkAsReadCommandHandler};
    use super::send_notification::{SendNotification, SendNotificationCommandHandler};
    use crate::delivery::NotificationDelivery;
    use crate::delivery::tests::FakeChannel;

    fn context_for(subject_id: &str, role: &str) -> ExecutionContext {
        ExecutionContext::new(ExecutionContextOptions {
            trace_id: "trace".into(),
            auth: Auth::of(subject_id, role),
            event_bus: Arc::new(InMemoryEventBus::new()),
            unit_of_work: None,
            logger: None,
        })
    }

    fn send(recipient_id: &str) -> SendNotification {
        SendNotification {
            recipient_id: recipient_id.into(),
            title: "Hello".into(),
            content: "World".into(),
            channels: vec!["WEBSOCKET".into()],
            metadata: Metadata::new(),
        }
    }

    #[test]
    fn an_administrator_sends_a_notification_by_hand_and_its_recipient_marks_it_read_once() {
        let store = Arc::new(InMemoryDataSource::new());
        let repository = Arc::new(InMemoryNotificationRepository::new(store.clone()));
        let delivery =
            Arc::new(NotificationDelivery::new(repository.clone(), vec![FakeChannel::new(Channel::WebSocket)]));
        let sender = SendNotificationCommandHandler::new(delivery);
        let reader = MarkAsReadCommandHandler::new(repository);

        let refused = pollster::block_on(sender.run(send("bob"), &context_for("bob", "USER")));
        assert!(refused.expect_err("users may not").is(NOT_ALLOWED));

        let id = pollster::block_on(sender.run(send("bob"), &context_for("root", "ADMIN"))).expect("sent");
        assert_eq!(store.get(&id).expect("stored").status, NotificationStatus::Sent);

        pollster::block_on(reader.run(MarkAsRead { notification_id: id.clone() }, &context_for("bob", "USER")))
            .expect("read");
        assert_eq!(store.get(&id).expect("stored").status, NotificationStatus::Read);
        let again = pollster::block_on(reader.run(MarkAsRead { notification_id: id }, &context_for("bob", "USER")));
        assert!(again.expect_err("twice").is(NOTIFICATION_ALREADY_READ));
        let unknown =
            pollster::block_on(reader.run(MarkAsRead { notification_id: "nope".into() }, &context_for("bob", "USER")));
        assert!(unknown.expect_err("unknown").is(NOTIFICATION_NOT_FOUND));
    }
}
