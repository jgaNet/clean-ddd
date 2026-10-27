package events

import (
	"fmt"

	"clean-ddd/architecture/application"
	notifapp "clean-ddd/contexts/notifications/application"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// NoteSharedHandler is the anti-corruption layer of the Notifications context towards Notes.
//
// It knows the published contract (NoteSharedIntegrationEvent) and nothing else about Notes: no
// Note aggregate, no Notes exception, no Notes port. It restates the fact in the Notifications
// vocabulary (a recipient, a title, channels) and hands it to the local use case. If the Notes
// contract changes, this file is the only one to touch here.
type NoteSharedHandler struct {
	delivery *notifapp.NotificationDelivery
}

func NewNoteSharedHandler(delivery *notifapp.NotificationDelivery) *NoteSharedHandler {
	return &NoteSharedHandler{delivery: delivery}
}

func (h *NoteSharedHandler) Execute(event integrationevents.NoteSharedIntegrationEvent, ctx *application.ExecutionContext) error {
	_, err := h.delivery.Deliver(notification.NewNotification{
		RecipientID: event.RecipientID,
		Title:       fmt.Sprintf("A note was shared with you: %s", event.Title),
		Content:     fmt.Sprintf(`You now have access to the note "%s".`, event.Title),
		Channels:    []notification.Channel{notification.ChannelWebSocket},
		Metadata:    map[string]any{"noteId": event.NoteID, "sharedBy": event.OwnerID, "source": "Notes.NoteShared"},
	}, ctx)
	return err
}
