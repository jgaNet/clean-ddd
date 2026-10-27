package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notifications/domain/notification"
	kernel "clean-ddd/sharedkernel/application"
)

// MarkAsRead follows the shape of every "change an existing aggregate" use case: who is calling
// -> load the aggregate -> ask it to change -> save -> publish what it recorded. No rule of its
// own: everything that can be refused is refused by Notification.

type MarkAsReadNotificationCommandEvent struct {
	domain.CommandEvent
	NotificationID string
}

type MarkAsReadNotificationHandler struct {
	notifications notification.Repository
}

func NewMarkAsReadNotificationHandler(notifications notification.Repository) *MarkAsReadNotificationHandler {
	return &MarkAsReadNotificationHandler{notifications: notifications}
}

func (h *MarkAsReadNotificationHandler) Execute(command MarkAsReadNotificationCommandEvent, ctx *application.ExecutionContext) (application.Nothing, error) {
	reader, err := kernel.RequireSignedIn(ctx, notification.Service)
	if err != nil {
		return application.Nothing{}, err
	}
	n, err := h.notifications.FindByID(command.NotificationID)
	if err != nil {
		return application.Nothing{}, err
	}
	if n == nil {
		return application.Nothing{}, notification.NotificationNotFound(command.NotificationID)
	}
	if err := n.MarkRead(reader); err != nil {
		return application.Nothing{}, err
	}
	if err := h.notifications.Save(n); err != nil {
		return application.Nothing{}, err
	}
	application.PublishDomainEvents(n, ctx)
	return application.Nothing{}, nil
}
