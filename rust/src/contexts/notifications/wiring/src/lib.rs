//! The wiring of the Notifications context: the channels, the one delivery service every entry
//! point ends in, the module — its commands, its query, and the five anti-corruption handlers
//! under the integration events they consume. The websocket channel is exported: the
//! composition root serves its `/ws` route.

use std::sync::Arc;

use architecture_application::{Logger, Module, ModuleDefinition, Subscription, query};
use architecture_infrastructure::InMemoryDataSource;
use notifications_application::commands::mark_as_read::MarkAsReadCommandHandler;
use notifications_application::commands::send_notification::SendNotificationCommandHandler;
use notifications_application::delivery::NotificationDelivery;
use notifications_application::events::{
    AccountCreatedHandler, AccountValidatedHandler, NoteArchivedHandler, NoteSharedHandler, OperationCompleteHandler,
};
use notifications_application::queries::get_notifications::GetNotificationsQueryHandler;
use notifications_domain::notification::NotificationSnapshot;
use notifications_infrastructure::{
    EmailChannel, InMemoryNotificationQueries, InMemoryNotificationRepository, WebSocketChannel,
};
use notifications_presentation::render;
use shared_kernel_application::integration_events::account_integration_events::AccountIntegrationEvent;
use shared_kernel_application::integration_events::note_integration_events::NoteIntegrationEvent;
use shared_kernel_application::integration_events::tracker_integration_events::OperationCompleteIntegrationEvent;

/// What the composition root decides for this context, from its settings.
pub struct NotificationsSettings {
    /// The application's public URL, which the validation link in the welcome email is built on.
    pub url: String,
    pub from_email: String,
}

/// The context's store, which the composition root hands to the unit of work.
pub type NotificationStore = Arc<InMemoryDataSource<NotificationSnapshot>>;

pub fn notification_store() -> NotificationStore {
    Arc::new(InMemoryDataSource::new())
}

/// The Notifications context, wired for the local environment.
pub struct LocalNotifications {
    pub module: Arc<Module>,
    /// The live channel; the composition root merges its `/ws` route before listening.
    pub websocket: Arc<WebSocketChannel>,
}

pub fn local_notifications_module(
    store: &NotificationStore,
    settings: &NotificationsSettings,
    logger: Arc<dyn Logger>,
) -> LocalNotifications {
    let repository = Arc::new(InMemoryNotificationRepository::new(store.clone()));
    let queries = Arc::new(InMemoryNotificationQueries::new(store.clone()));

    let websocket = Arc::new(WebSocketChannel::new(logger.clone(), render));
    let email = Arc::new(EmailChannel::new(logger, &settings.from_email));
    let delivery = Arc::new(NotificationDelivery::new(repository.clone(), vec![websocket.clone(), email]));

    let module = Module::new(ModuleDefinition {
        name: "Notifications",
        commands: vec![
            Subscription::command(SendNotificationCommandHandler::new(delivery.clone())),
            Subscription::command(MarkAsReadCommandHandler::new(repository)),
        ],
        queries: vec![query(GetNotificationsQueryHandler::new(queries))],
        domain_events: vec![],
        integration_events: vec![
            Subscription::reaction(
                AccountIntegrationEvent::CREATED,
                AccountCreatedHandler::new(&settings.url, delivery.clone()),
            ),
            Subscription::reaction(AccountIntegrationEvent::VALIDATED, AccountValidatedHandler::new(delivery.clone())),
            Subscription::reaction(
                OperationCompleteIntegrationEvent::NAME,
                OperationCompleteHandler::new(delivery.clone()),
            ),
            Subscription::reaction(NoteIntegrationEvent::SHARED, NoteSharedHandler::new(delivery.clone())),
            Subscription::reaction(NoteIntegrationEvent::ARCHIVED, NoteArchivedHandler::new(delivery)),
        ],
    });

    LocalNotifications { module: Arc::new(module), websocket }
}
