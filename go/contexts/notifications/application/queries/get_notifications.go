package queries

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notifications/domain/notification"
	kernel "clean-ddd/sharedkernel/application"
	roles "clean-ddd/sharedkernel/domain"
)

// GetNotifications is an inbox: an account reads its own; an administrator may read anyone's.

type GetNotificationsParams struct {
	RecipientID string
	Filters     notification.InboxFilters
}

type Inbox struct {
	Notifications []notification.ListItem
	Total         int
	Unread        int
}

type GetNotificationsHandler struct {
	queries notification.Queries
}

func NewGetNotificationsHandler(queries notification.Queries) *GetNotificationsHandler {
	return &GetNotificationsHandler{queries: queries}
}

func (h *GetNotificationsHandler) Execute(params GetNotificationsParams, ctx *application.ExecutionContext) (Inbox, error) {
	reader, err := kernel.RequireSignedIn(ctx, notification.Service)
	if err != nil {
		return Inbox{}, err
	}
	if role, _ := roles.ParseRole(ctx.Auth().Role); role != roles.RoleAdmin && reader.Value() != params.RecipientID {
		return Inbox{}, domain.NotAllowed(notification.Service, "Only the recipient or an administrator can read an inbox", nil)
	}

	notifications, err := h.queries.FindByRecipient(params.RecipientID, params.Filters)
	if err != nil {
		return Inbox{}, err
	}
	total, err := h.queries.CountByRecipient(params.RecipientID, false)
	if err != nil {
		return Inbox{}, err
	}
	unread, err := h.queries.CountByRecipient(params.RecipientID, true)
	if err != nil {
		return Inbox{}, err
	}
	return Inbox{Notifications: notifications, Total: total, Unread: unread}, nil
}
