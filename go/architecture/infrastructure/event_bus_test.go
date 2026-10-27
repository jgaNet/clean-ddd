package infrastructure

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
)

type GreetedEvent struct {
	domain.DomainEvent
	Name string
}

type WavedEvent struct{ domain.DomainEvent }

// recorder is a reaction that waits to be released before it reacts, so a test can look at
// the operation while the handling is still ahead, without racing the dispatch goroutine.
type recorder struct {
	release chan struct{}
	seen    []string
}

func (r *recorder) Execute(event GreetedEvent, _ *application.ExecutionContext) error {
	if r.release != nil {
		<-r.release
	}
	r.seen = append(r.seen, domain.NameOf(event)+" "+event.Name)
	return nil
}

// subscriber is a bare handler on the bus, for the dispatch tests: it does what it is told.
type subscriber func(operation *application.Operation)

func (s subscriber) Handle(operation *application.Operation) { s(operation) }

func subscribe(bus *InMemoryEventBus, subscription application.Subscription) {
	for _, handler := range subscription.Handlers {
		bus.Subscribe(subscription.Channel, handler)
	}
}

func contextOn(bus *InMemoryEventBus) *application.ExecutionContext {
	return application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus})
}

func TestAnswersWithTheOperationBeforeTheHandlingAndRoutesByName(t *testing.T) {
	bus := NewInMemoryEventBus()
	handler := &recorder{release: make(chan struct{})}
	subscribe(bus, application.Reaction[GreetedEvent](handler))

	operation := bus.Publish(GreetedEvent{Name: "alice"}, contextOn(bus))
	if operation.Status != application.StatusPending {
		t.Errorf("status before the handling: got %s, want PENDING", operation.Status)
	}
	if len(handler.seen) != 0 {
		t.Errorf("nothing should have been handled yet, got %v", handler.seen)
	}

	close(handler.release)
	bus.Settle()
	if want := []string{"GreetedEvent alice"}; !reflect.DeepEqual(handler.seen, want) {
		t.Errorf("seen: got %v, want %v", handler.seen, want)
	}
	if operation.Status != application.StatusSent {
		t.Errorf("status after the handling: got %s, want SENT", operation.Status)
	}
}

func TestAnEventNobodyListensToIsDispatchedToNoOne(t *testing.T) {
	bus := NewInMemoryEventBus()
	handler := &recorder{}
	subscribe(bus, application.Reaction[GreetedEvent](handler))

	operation := bus.Publish(WavedEvent{}, contextOn(bus))
	bus.Settle()

	if operation.Status != application.StatusPending {
		t.Errorf("status: got %s, want PENDING", operation.Status)
	}
	if len(handler.seen) != 0 {
		t.Errorf("the greeting handler should not see a wave, got %v", handler.seen)
	}
}

func TestDispatchesToEveryHandlerOfTheChannelInTheOrderTheySubscribed(t *testing.T) {
	bus := NewInMemoryEventBus()
	var order []string
	bus.Subscribe("GreetedEvent", subscriber(func(*application.Operation) { order = append(order, "first") }))
	bus.Subscribe("GreetedEvent", subscriber(func(*application.Operation) { order = append(order, "second") }))
	bus.Subscribe("WavedEvent", subscriber(func(*application.Operation) { order = append(order, "wave") }))

	bus.Publish(GreetedEvent{Name: "alice"}, contextOn(bus))
	bus.Settle()

	if want := []string{"first", "second"}; !reflect.DeepEqual(order, want) {
		t.Errorf("order: got %v, want %v", order, want)
	}
}

func TestDispatchRunsTheHandlersInTheCallingGoroutine(t *testing.T) {
	bus := NewInMemoryEventBus()
	var seen []domain.Event
	bus.Subscribe("GreetedEvent", subscriber(func(operation *application.Operation) {
		seen = append(seen, operation.Event)
		operation.Sent()
	}))

	operation := application.NewOperation(GreetedEvent{Name: "bob"}, contextOn(bus))
	bus.Dispatch(operation)

	if want := []domain.Event{GreetedEvent{Name: "bob"}}; !reflect.DeepEqual(seen, want) {
		t.Errorf("seen: got %v, want %v", seen, want)
	}
	if operation.Status != application.StatusSent {
		t.Errorf("status: got %s, want SENT once Dispatch returns", operation.Status)
	}
}

func TestSettleWaitsForTheEventsADispatchPublishes(t *testing.T) {
	bus := NewInMemoryEventBus()
	var order []string
	bus.Subscribe("GreetedEvent", subscriber(func(operation *application.Operation) {
		order = append(order, "greeted")
		operation.Context.Publish(WavedEvent{})
	}))
	bus.Subscribe("WavedEvent", subscriber(func(*application.Operation) { order = append(order, "waved") }))

	bus.Publish(GreetedEvent{Name: "alice"}, contextOn(bus))
	bus.Settle()

	if want := []string{"greeted", "waved"}; !reflect.DeepEqual(order, want) {
		t.Errorf("order: got %v, want %v", order, want)
	}
}

func TestConnectHasNothingToConnectTo(t *testing.T) {
	if err := NewInMemoryEventBus().Connect(); err != nil {
		t.Errorf("Connect: %v", err)
	}
}
