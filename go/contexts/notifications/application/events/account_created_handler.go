package events

import (
	"fmt"

	"clean-ddd/architecture/application"
	notifapp "clean-ddd/contexts/notifications/application"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// AccountCreatedHandler is the anti-corruption layer towards Security: a new account gets its
// validation link by email. The link points at the public URL of the API.
type AccountCreatedHandler struct {
	url      string
	delivery *notifapp.NotificationDelivery
}

func NewAccountCreatedHandler(url string, delivery *notifapp.NotificationDelivery) *AccountCreatedHandler {
	return &AccountCreatedHandler{url: url, delivery: delivery}
}

func (h *AccountCreatedHandler) Execute(event integrationevents.AccountCreatedIntegrationEvent, ctx *application.ExecutionContext) error {
	link := fmt.Sprintf("%s/auth/validate?validation_token=%s", h.url, event.ValidationToken)
	_, err := h.delivery.Deliver(notification.NewNotification{
		RecipientID: event.AccountID,
		Title:       "Welcome - verify your account",
		Content: "<p>Thank you for creating an account!</p>" +
			"<p>Please verify it by clicking on the link below:</p>" +
			fmt.Sprintf(`<p><a href="%s">Verify your account</a></p>`, link) +
			"<p>This link will expire in 24 hours.</p>",
		Channels: []notification.Channel{notification.ChannelEmail},
		Metadata: map[string]any{"email": event.Email, "source": "Security.AccountCreated"},
	}, ctx)
	return err
}
