// Package notifications is the wiring of the Notifications context: the store, the channels,
// the delivery service every entry point ends in, and the module listing the commands, the
// inbox query and the anti-corruption handlers on the contracts they consume. Plain data:
// construct the handler, pass its ports, list it (ARCH-MODULES-DATA). The websocket channel
// is exposed beside the module: the composition root mounts its handler at /ws.
package notifications

import (
	"clean-ddd/architecture/application"
	archinfra "clean-ddd/architecture/infrastructure"
	notifapp "clean-ddd/contexts/notifications/application"
	"clean-ddd/contexts/notifications/application/commands"
	"clean-ddd/contexts/notifications/application/events"
	"clean-ddd/contexts/notifications/application/queries"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/contexts/notifications/infrastructure"
	"clean-ddd/contexts/notifications/infrastructure/channels"
	"clean-ddd/contexts/notifications/presentation"
)

// NotificationStore is the context's store, which the composition root hands to the unit of work.
type NotificationStore = archinfra.InMemoryDataSource[notification.Snapshot]

func NewNotificationStore() *NotificationStore {
	return archinfra.NewInMemoryDataSource[notification.Snapshot]()
}

// Settings is what the context needs from the outside: the public URL of the API, for the
// links in the emails, and the address the emails come from.
type Settings struct {
	URL       string
	FromEmail string
}

// Wiring is the module, and the websocket channel the composition root mounts.
type Wiring struct {
	Module    *application.Module
	WebSocket *channels.WebSocketChannel
}

// LocalModule is the Notifications wiring for the local environment: write side and read side
// share the same store; the delivery tries the websocket first, then email.
func LocalModule(store *NotificationStore, settings Settings, logger application.Logger) *Wiring {
	repository := infrastructure.NewInMemoryNotificationRepository(store)
	notificationQueries := infrastructure.NewInMemoryNotificationQueries(store)

	htmx := presentation.NotificationHTMXPresenter{}
	webSocket := channels.NewWebSocketChannel(logger, htmx.Present)
	email := channels.NewEmailChannel(logger, settings.FromEmail)
	delivery := notifapp.NewNotificationDelivery(repository, []notification.NotificationChannel{webSocket, email})

	return &Wiring{
		WebSocket: webSocket,
		Module: &application.Module{
			Name: "Notifications",
			Commands: []application.Subscription{
				application.Command(commands.NewSendNotificationHandler(delivery)),
				application.Command(commands.NewMarkAsReadNotificationHandler(repository)),
			},
			Queries: []any{
				queries.NewGetNotificationsHandler(notificationQueries),
			},
			IntegrationEvents: []application.Subscription{
				application.Reaction(events.NewAccountCreatedHandler(settings.URL, delivery)),
				application.Reaction(events.NewAccountValidatedHandler(delivery)),
				application.Reaction(events.NewOperationCompleteHandler(delivery)),
				application.Reaction(events.NewNoteSharedHandler(delivery)),
			},
		},
	}
}
