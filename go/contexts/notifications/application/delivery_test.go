package application_test

import (
	"fmt"
	"reflect"
	"sync"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	archinfra "clean-ddd/architecture/infrastructure"
	notifapp "clean-ddd/contexts/notifications/application"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/contexts/notifications/infrastructure"
)

// The application service, with the in-memory repository as the double and a fake channel that
// says whether it is available, accepts or refuses, and remembers what it received.

type fakeChannel struct {
	channel   notification.Channel
	available bool
	accepts   bool
	delivered []notification.Delivery
}

func newFakeChannel(channel notification.Channel) *fakeChannel {
	return &fakeChannel{channel: channel, available: true, accepts: true}
}

func (c *fakeChannel) Channel() notification.Channel { return c.channel }

func (c *fakeChannel) IsAvailableFor(string) (bool, error) { return c.available, nil }

func (c *fakeChannel) Deliver(delivery notification.Delivery) error {
	c.delivered = append(c.delivered, delivery)
	if !c.accepts {
		return domain.Unknown(fmt.Sprintf("%s refused", c.channel), nil)
	}
	return nil
}

// recorder keeps what reached the bus on a channel, so a test can assert what was published.
type recorder struct {
	mu        sync.Mutex
	published []domain.Event
}

func (r *recorder) Handle(operation *application.Operation) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.published = append(r.published, operation.Event)
	operation.Sent()
}

func (r *recorder) events() []domain.Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]domain.Event(nil), r.published...)
}

type fixture struct {
	store    *archinfra.InMemoryDataSource[notification.Snapshot]
	bus      *archinfra.InMemoryEventBus
	recorded *recorder
	delivery *notifapp.NotificationDelivery
	context  *application.ExecutionContext
}

func newFixture(channels ...notification.NotificationChannel) *fixture {
	store := archinfra.NewInMemoryDataSource[notification.Snapshot]()
	bus := archinfra.NewInMemoryEventBus()
	recorded := &recorder{}
	bus.Subscribe(domain.NameOfType[notification.NotificationSentEvent](), recorded)
	bus.Subscribe(domain.NameOfType[notification.NotificationFailedEvent](), recorded)
	return &fixture{
		store:    store,
		bus:      bus,
		recorded: recorded,
		delivery: notifapp.NewNotificationDelivery(infrastructure.NewInMemoryNotificationRepository(store), channels),
		context:  application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus}),
	}
}

func (f *fixture) saved(t *testing.T, notificationID string) notification.Snapshot {
	t.Helper()
	snapshot, ok := f.store.Get(notificationID)
	if !ok {
		t.Fatalf("notification %s was not saved", notificationID)
	}
	return snapshot
}

// published is what reached the bus once every dispatch settled.
func (f *fixture) published() []domain.Event {
	f.bus.Settle()
	return f.recorded.events()
}

func attemptsOf(snapshot notification.Snapshot) [][2]any {
	var attempts [][2]any
	for _, a := range snapshot.Attempts {
		attempts = append(attempts, [2]any{a.Channel, a.Succeeded})
	}
	return attempts
}

var toBob = notification.NewNotification{
	RecipientID: "bob", Title: "Hello", Content: "World",
	Channels: []notification.Channel{notification.ChannelWebSocket, notification.ChannelEmail},
}

func TestDeliversThroughTheFirstAvailableChannelAndStopsThere(t *testing.T) {
	webSocket, email := newFakeChannel(notification.ChannelWebSocket), newFakeChannel(notification.ChannelEmail)
	f := newFixture(webSocket, email)

	id, err := f.delivery.Deliver(toBob, f.context)

	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if len(webSocket.delivered) != 1 || len(email.delivered) != 0 {
		t.Fatalf("websocket got %d, email got %d", len(webSocket.delivered), len(email.delivered))
	}
	saved := f.saved(t, id)
	if saved.Status != notification.StatusSent || saved.DeliveredVia != notification.ChannelWebSocket {
		t.Fatalf("status = %s, delivered via %q", saved.Status, saved.DeliveredVia)
	}
	if !reflect.DeepEqual(attemptsOf(saved), [][2]any{{notification.ChannelWebSocket, true}}) {
		t.Fatalf("attempts = %v", attemptsOf(saved))
	}
	expected := []domain.Event{notification.NotificationSentEvent{NotificationID: id, RecipientID: "bob", Via: notification.ChannelWebSocket}}
	if published := f.published(); !reflect.DeepEqual(published, expected) {
		t.Fatalf("published = %#v", published)
	}
}

func TestFallsBackToTheNextChannelWhenTheFirstIsUnavailable(t *testing.T) {
	webSocket, email := newFakeChannel(notification.ChannelWebSocket), newFakeChannel(notification.ChannelEmail)
	webSocket.available = false
	f := newFixture(webSocket, email)

	id, err := f.delivery.Deliver(toBob, f.context)

	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if len(webSocket.delivered) != 0 || len(email.delivered) != 1 {
		t.Fatalf("websocket got %d, email got %d", len(webSocket.delivered), len(email.delivered))
	}
	saved := f.saved(t, id)
	if saved.Status != notification.StatusSent || saved.DeliveredVia != notification.ChannelEmail {
		t.Fatalf("status = %s, delivered via %q", saved.Status, saved.DeliveredVia)
	}
	expected := [][2]any{{notification.ChannelWebSocket, false}, {notification.ChannelEmail, true}}
	if !reflect.DeepEqual(attemptsOf(saved), expected) {
		t.Fatalf("attempts = %v", attemptsOf(saved))
	}
}

func TestFailsTheNotificationKeepingEveryAttemptWhenNoChannelAcceptsIt(t *testing.T) {
	webSocket, email := newFakeChannel(notification.ChannelWebSocket), newFakeChannel(notification.ChannelEmail)
	webSocket.accepts, email.accepts = false, false
	f := newFixture(webSocket, email)

	id, err := f.delivery.Deliver(toBob, f.context)

	if err != nil { // the delivery ran; the notification records the failure
		t.Fatalf("unexpected refusal: %v", err)
	}
	saved := f.saved(t, id)
	if saved.Status != notification.StatusFailed || len(saved.Attempts) != 2 {
		t.Fatalf("status = %s, %d attempts", saved.Status, len(saved.Attempts))
	}
	expected := []domain.Event{notification.NotificationFailedEvent{NotificationID: id, RecipientID: "bob"}}
	if published := f.published(); !reflect.DeepEqual(published, expected) {
		t.Fatalf("published = %#v", published)
	}
}

func TestTreatsAChannelWithNoAdapterAsUnavailable(t *testing.T) {
	f := newFixture(newFakeChannel(notification.ChannelEmail))
	id, err := f.delivery.Deliver(toBob, f.context)
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if via := f.saved(t, id).DeliveredVia; via != notification.ChannelEmail {
		t.Fatalf("delivered via %q", via)
	}
}

func TestRefusesAnInvalidNotificationBeforeTouchingAnyChannel(t *testing.T) {
	webSocket := newFakeChannel(notification.ChannelWebSocket)
	f := newFixture(webSocket)

	blank := notification.NewNotification{RecipientID: "bob", Title: "  ", Content: "World", Channels: []notification.Channel{notification.ChannelWebSocket}}
	_, err := f.delivery.Deliver(blank, f.context)

	if _, refused := domain.Refusal(err); !refused {
		t.Fatalf("expected a refusal, got %v", err)
	}
	if len(webSocket.delivered) != 0 || len(f.store.All()) != 0 {
		t.Fatalf("no channel is touched and nothing is saved")
	}
}
