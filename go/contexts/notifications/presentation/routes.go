package presentation

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/presentation"
	"clean-ddd/contexts/notifications/application/commands"
	"clean-ddd/contexts/notifications/application/queries"
	"clean-ddd/contexts/notifications/domain/notification"
)

// The verb follows the HTTP grammar: POST /notifications sends one, GET /notifications/account/{id}
// reads an inbox, PATCH /notifications/{id}/read changes part of its state.

type sendNotificationBody struct {
	RecipientID string         `json:"recipientId"`
	Title       string         `json:"title"`
	Content     string         `json:"content"`
	Channels    []string       `json:"channels"`
	Metadata    map[string]any `json:"metadata"`
}

// The views: what a read model looks like outside, in camelCase, timestamps in RFC 3339 UTC;
// what did not happen yet is omitted. The attempts never appear.

type listItemView struct {
	ID           string         `json:"id"`
	RecipientID  string         `json:"recipientId"`
	Title        string         `json:"title"`
	Content      string         `json:"content"`
	Status       string         `json:"status"`
	Channels     []string       `json:"channels"`
	DeliveredVia string         `json:"deliveredVia,omitempty"`
	CreatedAt    string         `json:"createdAt"`
	SentAt       string         `json:"sentAt,omitempty"`
	ReadAt       string         `json:"readAt,omitempty"`
	Metadata     map[string]any `json:"metadata"`
}

type inboxView struct {
	Notifications []listItemView `json:"notifications"`
	Total         int            `json:"total"`
	Unread        int            `json:"unread"`
}

func timestamp(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339Nano)
}

func listItemViewOf(n notification.ListItem) listItemView {
	channels := make([]string, 0, len(n.Channels))
	for _, channel := range n.Channels {
		channels = append(channels, string(channel))
	}
	metadata := n.Metadata
	if metadata == nil {
		metadata = map[string]any{}
	}
	return listItemView{
		ID:           n.ID,
		RecipientID:  n.RecipientID,
		Title:        n.Title,
		Content:      n.Content,
		Status:       string(n.Status),
		Channels:     channels,
		DeliveredVia: string(n.DeliveredVia),
		CreatedAt:    timestamp(&n.CreatedAt),
		SentAt:       timestamp(n.SentAt),
		ReadAt:       timestamp(n.ReadAt),
		Metadata:     metadata,
	}
}

func inboxViewOf(inbox queries.Inbox) inboxView {
	views := make([]listItemView, 0, len(inbox.Notifications))
	for _, item := range inbox.Notifications {
		views = append(views, listItemViewOf(item))
	}
	return inboxView{Notifications: views, Total: inbox.Total, Unread: inbox.Unread}
}

func refuseNotification(w http.ResponseWriter, err error) {
	status := presentation.StatusOf(err)
	if exception, ok := domain.Refusal(err); ok && exception.Type == "NotificationNotFound" {
		status = http.StatusNotFound
	}
	presentation.Refuse(w, err, status)
}

// inboxFilters reads the page from the query string: limit (20), offset (0), onlyUnread (false).
func inboxFilters(r *http.Request) (notification.InboxFilters, error) {
	query := r.URL.Query()
	filters := notification.InboxFilters{Limit: notification.DefaultInboxLimit}
	var err error
	if raw := query.Get("limit"); raw != "" {
		if filters.Limit, err = strconv.Atoi(raw); err != nil {
			return filters, errors.New("limit must be an integer")
		}
	}
	if raw := query.Get("offset"); raw != "" {
		if filters.Offset, err = strconv.Atoi(raw); err != nil {
			return filters, errors.New("offset must be an integer")
		}
	}
	if raw := query.Get("onlyUnread"); raw != "" {
		if filters.OnlyUnread, err = strconv.ParseBool(raw); err != nil {
			return filters, errors.New("onlyUnread must be a boolean")
		}
	}
	return filters, nil
}

// Routes registers the context's routes under prefix (/v1/notifications) on the application's mux.
func Routes(mux *http.ServeMux, prefix string, module *application.Module) {
	mux.HandleFunc("POST "+prefix, func(w http.ResponseWriter, r *http.Request) {
		var body sendNotificationBody
		if !presentation.DecodeBody(w, r, &body) {
			return
		}
		// Shape only (API-BODY-SHAPE): the channels go on as the names the client sent, and an
		// unknown one, or none, is the domain's refusal, on the operation.
		presentation.Accept(w, presentation.ContextOf(r), commands.SendNotificationCommandEvent{
			RecipientID: body.RecipientID,
			Title:       body.Title,
			Content:     body.Content,
			Channels:    body.Channels,
			Metadata:    body.Metadata,
		})
	})

	mux.HandleFunc("GET "+prefix+"/account/{recipientId}", func(w http.ResponseWriter, r *http.Request) {
		ctx := presentation.ContextOf(r)
		filters, err := inboxFilters(r)
		if err != nil {
			presentation.Refuse(w, err, http.StatusBadRequest)
			return
		}
		params := queries.GetNotificationsParams{RecipientID: r.PathValue("recipientId"), Filters: filters}
		inbox, err := application.Query(application.QueryOf[*queries.GetNotificationsHandler](module), params, ctx)
		if err != nil {
			refuseNotification(w, err)
			return
		}
		presentation.WriteJSON(w, http.StatusOK, inboxViewOf(inbox))
	})

	mux.HandleFunc("PATCH "+prefix+"/{id}/read", func(w http.ResponseWriter, r *http.Request) {
		presentation.Accept(w, presentation.ContextOf(r), commands.MarkAsReadNotificationCommandEvent{NotificationID: r.PathValue("id")})
	})
}
