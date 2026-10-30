package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	notifapp "clean-ddd/contexts/notifications/application"
	"clean-ddd/contexts/notifications/domain/notification"
	kernel "clean-ddd/sharedkernel/domain"
)

// SendNotification is a notification sent by hand, by an administrator. Reactions to other
// contexts do not go through it: they call the delivery service directly.

type SendNotificationCommandEvent struct {
	domain.CommandEvent
	RecipientID string
	Title       string
	Content     string
	// Channels are names, as a client sent them: the domain refuses one it does not know.
	Channels []string
	Metadata map[string]any
}

type SendNotificationHandler struct {
	delivery *notifapp.NotificationDelivery
}

func NewSendNotificationHandler(delivery *notifapp.NotificationDelivery) *SendNotificationHandler {
	return &SendNotificationHandler{delivery: delivery}
}

// Guard reserves the command to administrators: a rule about who may run it at all, which needs
// no caller id, so it lives here rather than in Execute.
func (h *SendNotificationHandler) Guard(ctx *application.ExecutionContext) error {
	if role, _ := kernel.ParseRole(ctx.Auth().Role); role != kernel.RoleAdmin {
		return domain.NotAllowed(notification.Service, "Only administrators can send notifications by hand", nil)
	}
	return nil
}

// Execute answers with the id of the notification: the operation's result.
func (h *SendNotificationHandler) Execute(command SendNotificationCommandEvent, ctx *application.ExecutionContext) (string, error) {
	channels, err := notification.ParseChannels(command.Channels)
	if err != nil {
		return "", err
	}
	return h.delivery.Deliver(notification.NewNotification{
		RecipientID: command.RecipientID,
		Title:       command.Title,
		Content:     command.Content,
		Channels:    channels,
		Metadata:    command.Metadata,
	}, ctx)
}
