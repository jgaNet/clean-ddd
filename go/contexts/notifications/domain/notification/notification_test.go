package notification

import (
	"reflect"
	"testing"
	"time"

	"clean-ddd/architecture/domain"
)

var (
	bob, carol = domain.NewID("bob"), domain.NewID("carol")
	at         = time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	both       = []Channel{ChannelWebSocket, ChannelEmail}
)

func aNotification(t *testing.T, channels ...Channel) *Notification {
	t.Helper()
	if len(channels) == 0 {
		channels = both
	}
	n, err := Create(NewNotification{RecipientID: "bob", Title: "Hello", Content: "World", Channels: channels}, at)
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	return n
}

func mustRecord(t *testing.T, n *Notification, channel Channel, succeeded bool) {
	t.Helper()
	if err := n.RecordAttempt(channel, succeeded, at); err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
}

func refusalType(t *testing.T, err error) string {
	t.Helper()
	exception, ok := domain.Refusal(err)
	if !ok {
		t.Fatalf("expected a refusal, got %v", err)
	}
	return exception.Type
}

func attemptsOf(n *Notification) [][2]any {
	var attempts [][2]any
	for _, a := range n.Attempts() {
		attempts = append(attempts, [2]any{a.Channel(), a.Succeeded()})
	}
	return attempts
}

func TestCreatingStartsPendingWithEveryChannelOfTheStrategyStillToTry(t *testing.T) {
	n := aNotification(t)
	if n.Status() != StatusPending {
		t.Fatalf("status = %s", n.Status())
	}
	if !reflect.DeepEqual(n.ChannelsToTry(), both) {
		t.Fatalf("channels to try = %v", n.ChannelsToTry())
	}
	if len(n.Attempts()) != 0 || len(n.PullDomainEvents()) != 0 {
		t.Fatalf("a new notification has no attempts and no events")
	}
}

func TestCreatingRefusesABlankTitleAndAnEmptyStrategy(t *testing.T) {
	_, blank := Create(NewNotification{RecipientID: "bob", Title: " ", Content: "x", Channels: []Channel{ChannelEmail}})
	_, empty := Create(NewNotification{RecipientID: "bob", Title: "x", Content: "x", Channels: []Channel{}})
	if refusalType(t, blank) != "BlankNotificationTitle" {
		t.Fatalf("blank title: %v", blank)
	}
	if refusalType(t, empty) != "EmptyDeliveryStrategy" {
		t.Fatalf("empty strategy: %v", empty)
	}
}

func TestIsSentByTheFirstChannelThatAcceptsItAndRecordsNotificationSent(t *testing.T) {
	n := aNotification(t)

	mustRecord(t, n, ChannelWebSocket, true)

	if n.Status() != StatusSent || n.DeliveredVia() != ChannelWebSocket {
		t.Fatalf("status = %s, delivered via %q", n.Status(), n.DeliveredVia())
	}
	if len(n.ChannelsToTry()) != 0 {
		t.Fatalf("nothing is left to try once sent, got %v", n.ChannelsToTry())
	}
	if !reflect.DeepEqual(attemptsOf(n), [][2]any{{ChannelWebSocket, true}}) {
		t.Fatalf("attempts = %v", attemptsOf(n))
	}
	expected := []domain.Event{NotificationSentEvent{NotificationID: n.ID().Value(), RecipientID: "bob", Via: ChannelWebSocket}}
	if events := n.PullDomainEvents(); !reflect.DeepEqual(events, expected) {
		t.Fatalf("events = %#v", events)
	}
}

func TestFallsBackToTheNextChannelAfterAFailure(t *testing.T) {
	n := aNotification(t)

	mustRecord(t, n, ChannelWebSocket, false)
	if n.Status() != StatusPending {
		t.Fatalf("status = %s", n.Status())
	}
	if !reflect.DeepEqual(n.ChannelsToTry(), []Channel{ChannelEmail}) {
		t.Fatalf("channels to try = %v", n.ChannelsToTry())
	}

	mustRecord(t, n, ChannelEmail, true)
	if n.Status() != StatusSent || n.DeliveredVia() != ChannelEmail {
		t.Fatalf("status = %s, delivered via %q", n.Status(), n.DeliveredVia())
	}
	if len(n.Attempts()) != 2 {
		t.Fatalf("attempts = %d", len(n.Attempts()))
	}
}

func TestFailsOnceEveryChannelWasTriedAndRecordsNotificationFailed(t *testing.T) {
	n := aNotification(t)
	mustRecord(t, n, ChannelWebSocket, false)
	mustRecord(t, n, ChannelEmail, false)

	if n.Status() != StatusFailed {
		t.Fatalf("status = %s", n.Status())
	}
	expected := []domain.Event{NotificationFailedEvent{NotificationID: n.ID().Value(), RecipientID: "bob"}}
	if events := n.PullDomainEvents(); !reflect.DeepEqual(events, expected) {
		t.Fatalf("events = %#v", events)
	}
}

func TestNeverTriesTheSameChannelTwiceAndGivesEachAttemptItsOwnIdentity(t *testing.T) {
	n := aNotification(t)
	mustRecord(t, n, ChannelWebSocket, false)
	if twice := n.RecordAttempt(ChannelWebSocket, true, at); refusalType(t, twice) != "ChannelAlreadyTried" {
		t.Fatalf("twice: %v", twice)
	}

	mustRecord(t, n, ChannelEmail, false)
	attempts := n.Attempts()
	if attempts[0].Equals(attempts[1].Entity) {
		t.Fatalf("two attempts are two entities")
	}
}

func TestIsMarkedReadByItsRecipientOnceDeliveredAndRecordsNotificationRead(t *testing.T) {
	n := aNotification(t)
	mustRecord(t, n, ChannelWebSocket, true)
	n.PullDomainEvents()

	if err := n.MarkRead(bob, at); err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if n.Status() != StatusRead {
		t.Fatalf("status = %s", n.Status())
	}
	expected := []domain.Event{NotificationReadEvent{NotificationID: n.ID().Value(), RecipientID: "bob"}}
	if events := n.PullDomainEvents(); !reflect.DeepEqual(events, expected) {
		t.Fatalf("events = %#v", events)
	}
}

func TestReadingIsReservedToTheRecipient(t *testing.T) {
	n := aNotification(t)
	mustRecord(t, n, ChannelWebSocket, true)
	if refused := n.MarkRead(carol); refusalType(t, refused) != "NotNotificationRecipient" {
		t.Fatalf("refused: %v", refused)
	}
}

func TestCannotBeReadBeforeDeliveryNorTwice(t *testing.T) {
	pending := aNotification(t)
	if early := pending.MarkRead(bob); refusalType(t, early) != "NotificationNotDelivered" {
		t.Fatalf("early: %v", early)
	}

	read := aNotification(t)
	mustRecord(t, read, ChannelWebSocket, true)
	if err := read.MarkRead(bob); err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if again := read.MarkRead(bob); refusalType(t, again) != "NotificationAlreadyRead" {
		t.Fatalf("again: %v", again)
	}
}

func TestRebuildsTheNotificationAndItsAttemptsFromASnapshotWithoutEvents(t *testing.T) {
	n := aNotification(t)
	mustRecord(t, n, ChannelWebSocket, false)
	mustRecord(t, n, ChannelEmail, true)
	if err := n.MarkRead(bob, at); err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}

	rebuilt := FromSnapshot(n.ToSnapshot())

	if !rebuilt.Equals(n.Entity) {
		t.Fatalf("the rebuilt notification is the same entity")
	}
	if !reflect.DeepEqual(rebuilt.ToSnapshot(), n.ToSnapshot()) {
		t.Fatalf("snapshots differ:\n%#v\n%#v", rebuilt.ToSnapshot(), n.ToSnapshot())
	}
	for i, attempt := range rebuilt.Attempts() {
		if attempt.ID() != n.Attempts()[i].ID() {
			t.Fatalf("attempt %d lost its identity", i)
		}
	}
	if len(rebuilt.PullDomainEvents()) != 0 {
		t.Fatalf("rebuilding records nothing")
	}
}

func TestAStrategyDropsDuplicateChannelsKeepsTheOrderAndComparesByValue(t *testing.T) {
	strategy, err := NewDeliveryStrategy([]Channel{ChannelEmail, ChannelWebSocket, ChannelEmail})
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if !reflect.DeepEqual(strategy.Channels(), []Channel{ChannelEmail, ChannelWebSocket}) {
		t.Fatalf("channels = %v", strategy.Channels())
	}
	same, _ := NewDeliveryStrategy(both)
	other, _ := NewDeliveryStrategy(both)
	reversed, _ := NewDeliveryStrategy([]Channel{ChannelEmail, ChannelWebSocket})
	if !same.Equals(other) {
		t.Fatalf("the same channels in the same order are the same strategy")
	}
	if same.Equals(reversed) {
		t.Fatalf("the order is the strategy")
	}
}
