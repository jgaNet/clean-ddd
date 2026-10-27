package application

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/domain"
)

func TestPublishesAfterTheCommitEverythingTheAggregateRecordedDuringTheTransaction(t *testing.T) {
	bus := &recordingBus{}
	context := NewExecutionContext(Options{TraceID: "trace", EventBus: bus})
	g := &greeter{AggregateRoot: domain.NewAggregateRoot(domain.NewID("g"), 0)}

	_, err := Transaction(context, func() (nothing, error) {
		g.greet("alice")
		PublishDomainEvents(g, context)
		g.greet("bob") // recorded after the call, still inside the transaction
		if len(bus.published) != 0 {
			t.Errorf("nothing should be published before the commit, got %v", bus.published)
		}
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []domain.Event{GreetedEvent{Name: "alice"}, GreetedEvent{Name: "bob"}}; !reflect.DeepEqual(bus.published, want) {
		t.Errorf("published: got %v, want %v", bus.published, want)
	}
	if left := g.PullDomainEvents(); len(left) != 0 {
		t.Errorf("the aggregate should have been emptied, got %v", left)
	}
}

func TestLeavesTheEventsOnTheAggregateUnpublishedWhenTheTransactionRollsBack(t *testing.T) {
	bus := &recordingBus{}
	context := NewExecutionContext(Options{TraceID: "trace", EventBus: bus})
	g := &greeter{AggregateRoot: domain.NewAggregateRoot(domain.NewID("g"), 0)}

	_, err := Transaction(context, func() (nothing, error) {
		g.greet("alice")
		PublishDomainEvents(g, context)
		return nothing{}, domain.NotAllowed("Test", "refused", nil)
	})
	if !domain.IsNotAllowed(err) {
		t.Fatalf("the refusal should come back, got %v", err)
	}
	if len(bus.published) != 0 {
		t.Errorf("published: got %v, want nothing", bus.published)
	}
	if left := g.PullDomainEvents(); len(left) != 1 {
		t.Errorf("the events should still be on the aggregate, got %v", left)
	}
}

func TestPublishesAtOnceOutsideOfAnyTransaction(t *testing.T) {
	bus := &recordingBus{}
	context := NewExecutionContext(Options{TraceID: "trace", EventBus: bus})
	g := &greeter{AggregateRoot: domain.NewAggregateRoot(domain.NewID("g"), 0)}

	g.greet("alice")
	PublishDomainEvents(g, context)

	if want := []domain.Event{GreetedEvent{Name: "alice"}}; !reflect.DeepEqual(bus.published, want) {
		t.Errorf("published: got %v, want %v", bus.published, want)
	}
}
