package events

import (
	"fmt"

	"clean-ddd/architecture/application"
	notifapp "clean-ddd/contexts/notifications/application"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// OperationCompleteHandler is the anti-corruption layer towards Tracker: the caller of an
// asynchronous command learns how it went, live, over the websocket. Only the outcomes are
// worth a notification.
type OperationCompleteHandler struct {
	delivery *notifapp.NotificationDelivery
}

func NewOperationCompleteHandler(delivery *notifapp.NotificationDelivery) *OperationCompleteHandler {
	return &OperationCompleteHandler{delivery: delivery}
}

func (h *OperationCompleteHandler) Execute(event integrationevents.OperationCompleteIntegrationEvent, ctx *application.ExecutionContext) error {
	var title, content string
	switch application.Status(event.Status) {
	case application.StatusSuccess:
		title = fmt.Sprintf("Operation complete: %s", event.Type)
		content = fmt.Sprintf("Your operation %s succeeded.", event.OperationID)
	case application.StatusError:
		reason := event.Error
		if reason == "" {
			reason = "unknown error"
		}
		title = fmt.Sprintf("Operation failed: %s", event.Type)
		content = fmt.Sprintf("Your operation %s failed: %s", event.OperationID, reason)
	default:
		return nil // not an outcome (PENDING, SENT): nothing to tell the user yet
	}

	metadata := map[string]any{"operationId": event.OperationID, "type": event.Type, "status": event.Status}
	if event.Result != nil {
		metadata["result"] = event.Result
	}
	if event.Error != "" {
		metadata["error"] = event.Error
	}
	_, err := h.delivery.Deliver(notification.NewNotification{
		RecipientID: event.UserID,
		Title:       title,
		Content:     content,
		Channels:    []notification.Channel{notification.ChannelWebSocket},
		Metadata:    metadata,
	}, ctx)
	return err
}
