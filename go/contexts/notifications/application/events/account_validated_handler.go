package events

import (
	"clean-ddd/architecture/application"
	notifapp "clean-ddd/contexts/notifications/application"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// AccountValidatedHandler is the anti-corruption layer towards Security: a validated account is
// welcomed by email.
type AccountValidatedHandler struct {
	delivery *notifapp.NotificationDelivery
}

func NewAccountValidatedHandler(delivery *notifapp.NotificationDelivery) *AccountValidatedHandler {
	return &AccountValidatedHandler{delivery: delivery}
}

func (h *AccountValidatedHandler) Execute(event integrationevents.AccountValidatedIntegrationEvent, ctx *application.ExecutionContext) error {
	_, err := h.delivery.Deliver(notification.NewNotification{
		RecipientID: event.AccountID,
		Title:       "Welcome! Your account is now active",
		Content: "<p>Your account has been verified. You now have full access to the platform.</p>" +
			"<p>Thank you for joining us!</p>",
		Channels: []notification.Channel{notification.ChannelEmail},
		Metadata: map[string]any{"email": event.Email, "source": "Security.AccountValidated"},
	}, ctx)
	return err
}
