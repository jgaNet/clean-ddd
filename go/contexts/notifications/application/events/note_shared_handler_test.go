package events_test

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/application"
	archinfra "clean-ddd/architecture/infrastructure"
	notifapp "clean-ddd/contexts/notifications/application"
	"clean-ddd/contexts/notifications/application/events"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/contexts/notifications/infrastructure"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// fakeChannel remembers what it received, and accepts everything.
type fakeChannel struct {
	channel   notification.Channel
	delivered []notification.Delivery
}

func (c *fakeChannel) Channel() notification.Channel       { return c.channel }
func (c *fakeChannel) IsAvailableFor(string) (bool, error) { return true, nil }
func (c *fakeChannel) Deliver(d notification.Delivery) error {
	c.delivered = append(c.delivered, d)
	return nil
}

func TestTurnsTheNotesFactIntoALiveNotificationForTheRecipientInNotificationsTerms(t *testing.T) {
	webSocket := &fakeChannel{channel: notification.ChannelWebSocket}
	store := archinfra.NewInMemoryDataSource[notification.Snapshot]()
	delivery := notifapp.NewNotificationDelivery(infrastructure.NewInMemoryNotificationRepository(store), []notification.NotificationChannel{webSocket})
	bus := archinfra.NewInMemoryEventBus()
	ctx := application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus})

	err := events.NewNoteSharedHandler(delivery).Execute(
		integrationevents.NoteSharedIntegrationEvent{NoteID: "note-1", Title: "Groceries", OwnerID: "alice", RecipientID: "bob"},
		ctx,
	)
	bus.Settle()

	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if len(webSocket.delivered) != 1 {
		t.Fatalf("delivered %d notifications", len(webSocket.delivered))
	}
	delivered := webSocket.delivered[0]
	if delivered.RecipientID != "bob" || delivered.Title != "A note was shared with you: Groceries" {
		t.Fatalf("delivered to %s: %q", delivered.RecipientID, delivered.Title)
	}
	expected := map[string]any{"noteId": "note-1", "sharedBy": "alice", "source": "Notes.NoteShared"}
	if !reflect.DeepEqual(delivered.Metadata, expected) {
		t.Fatalf("metadata = %v", delivered.Metadata)
	}
	saved, ok := store.Get(delivered.NotificationID)
	if !ok {
		t.Fatalf("the notification was not saved")
	}
	if saved.RecipientID != "bob" || !reflect.DeepEqual(saved.Channels, []notification.Channel{notification.ChannelWebSocket}) {
		t.Fatalf("saved for %s over %v", saved.RecipientID, saved.Channels)
	}
}
