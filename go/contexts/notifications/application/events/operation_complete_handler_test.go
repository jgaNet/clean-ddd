package events_test

import (
	"reflect"
	"testing"
	"time"

	"clean-ddd/architecture/application"
	archinfra "clean-ddd/architecture/infrastructure"
	notifapp "clean-ddd/contexts/notifications/application"
	"clean-ddd/contexts/notifications/application/events"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/contexts/notifications/infrastructure"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// deliverOutcome hands one OperationComplete notice to the handler and answers what the caller received.
func deliverOutcome(t *testing.T, notice integrationevents.OperationCompleteIntegrationEvent) []notification.Delivery {
	t.Helper()
	webSocket := &fakeChannel{channel: notification.ChannelWebSocket}
	store := archinfra.NewInMemoryDataSource[notification.Snapshot]()
	delivery := notifapp.NewNotificationDelivery(infrastructure.NewInMemoryNotificationRepository(store), []notification.NotificationChannel{webSocket}, time.Now)
	bus := archinfra.NewInMemoryEventBus(time.Now)
	ctx := application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus})

	err := events.NewOperationCompleteHandler(delivery).Execute(notice, ctx)
	bus.Settle()
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	return webSocket.delivered
}

// The published language says `error: string?`: a success carries none, and the notification says none.
func TestTellsTheCallerTheirOperationSucceededWithNoErrorWhenTheNoticeCarriesNone(t *testing.T) {
	delivered := deliverOutcome(t, integrationevents.OperationCompleteIntegrationEvent{
		OperationID: "op-1", UserID: "alice", Status: "SUCCESS", Type: "ShareNote", Result: "note-1",
	})

	if len(delivered) != 1 || delivered[0].RecipientID != "alice" || delivered[0].Title != "Operation complete: ShareNote" {
		t.Fatalf("delivered %+v", delivered)
	}
	expected := map[string]any{"operationId": "op-1", "type": "ShareNote", "status": "SUCCESS", "result": "note-1"}
	if !reflect.DeepEqual(delivered[0].Metadata, expected) {
		t.Fatalf("metadata = %v", delivered[0].Metadata)
	}
}

func TestTellsTheCallerWhyTheirOperationFailed(t *testing.T) {
	reason := "Nobody to share with"
	delivered := deliverOutcome(t, integrationevents.OperationCompleteIntegrationEvent{
		OperationID: "op-2", UserID: "alice", Status: "ERROR", Type: "ShareNote", Error: &reason,
	})

	if len(delivered) != 1 || delivered[0].Content != "Your operation op-2 failed: Nobody to share with" {
		t.Fatalf("delivered %+v", delivered)
	}
	expected := map[string]any{"operationId": "op-2", "type": "ShareNote", "status": "ERROR", "error": reason}
	if !reflect.DeepEqual(delivered[0].Metadata, expected) {
		t.Fatalf("metadata = %v", delivered[0].Metadata)
	}
}
