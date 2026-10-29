package application

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/domain"
)

// ADR 3 and ADR 24: durable with the state at commit, published from the outbox after it, never
// lost. The unit of work here is the fake of execution_context_test.go, whose outbox is rolled
// back with it; the real pair is held to the same promises in the Infrastructure package.

func outboxContext() (*ExecutionContext, *fakeUnitOfWork, *recordingBus) {
	unitOfWork := newFakeUnitOfWork()
	bus := &recordingBus{}
	context := NewExecutionContext(Options{TraceID: "trace", EventBus: bus, UnitOfWork: unitOfWork, Auth: Auth{SubjectID: "alice", Role: "USER"}})
	return context, unitOfWork, bus
}

func newGreeter(id string) *greeter {
	return &greeter{AggregateRoot: domain.NewAggregateRoot(domain.NewID(id), 0)}
}

func TestStoresAtCommitEverythingTheAggregateRecordedDuringTheTransactionAndPublishesItAfter(t *testing.T) {
	context, unitOfWork, bus := outboxContext()
	g := newGreeter("g")

	_, err := Transaction(context, func() (nothing, error) {
		g.greet("alice")
		PublishDomainEvents(g, context)
		g.greet("bob") // recorded after the call, still inside the transaction
		if pending := unitOfWork.outbox.Pending(); len(pending) != 0 {
			t.Errorf("nothing should be stored before the commit, got %v", pending)
		}
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
	if pending := unitOfWork.outbox.Pending(); len(pending) != 0 {
		t.Errorf("the outbox should have been relayed, got %v", pending)
	}
}

func TestPublishesEachFactWithItsOutboxEntryAsTheMessageIDSoTheBusCanRecogniseIt(t *testing.T) {
	context, unitOfWork, bus := outboxContext()
	g := newGreeter("g")

	_, err := Transaction(context, func() (nothing, error) {
		g.greet("alice")
		g.greet("bob")
		PublishDomainEvents(g, context)
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if len(unitOfWork.outbox.appended) != 2 || !reflect.DeepEqual(bus.messageIDs, unitOfWork.outbox.appended) {
		t.Errorf("message ids: got %v, want the entries' %v", bus.messageIDs, unitOfWork.outbox.appended)
	}
}

func TestStoresNothingAndLeavesTheEventsOnTheAggregateWhenTheTransactionRollsBack(t *testing.T) {
	context, unitOfWork, bus := outboxContext()
	g := newGreeter("g")

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
	if pending := unitOfWork.outbox.Pending(); len(pending) != 0 {
		t.Errorf("stored: got %v, want nothing", pending)
	}
	if left := g.PullDomainEvents(); len(left) != 1 {
		t.Errorf("the events should still be on the aggregate, got %v", left)
	}
}

func TestKeepsAFactTheRelayCouldNotPublishAndTheNextCommitPublishesIt(t *testing.T) {
	context, unitOfWork, bus := outboxContext()
	bus.panicOnce = true // the bus is down for the first publication
	g := newGreeter("g")

	_, err := Transaction(context, func() (nothing, error) {
		g.greet("alice")
		PublishDomainEvents(g, context)
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("a relay that fails is not the use case's failure: %v", err)
	}
	if len(bus.published) != 0 {
		t.Errorf("published: got %v, want nothing yet", bus.published)
	}
	if want := []domain.Event{GreetedEvent{Name: "alice"}}; !reflect.DeepEqual(unitOfWork.outbox.events(), want) {
		t.Errorf("pending: got %v, want %v", unitOfWork.outbox.events(), want)
	}

	other := newGreeter("h")
	_, err = Transaction(context, func() (nothing, error) {
		other.greet("bob")
		PublishDomainEvents(other, context)
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []domain.Event{GreetedEvent{Name: "alice"}, GreetedEvent{Name: "bob"}}; !reflect.DeepEqual(bus.published, want) {
		t.Errorf("published: got %v, want %v", bus.published, want)
	}
	if pending := unitOfWork.outbox.Pending(); len(pending) != 0 {
		t.Errorf("the outbox should be empty, got %v", pending)
	}
}

func TestStoresAndPublishesAtOnceOutsideAnyTransactionAReactionAfterTheCommandThatSetItOffCommitted(t *testing.T) {
	context, unitOfWork, bus := outboxContext()
	g := newGreeter("g")

	g.greet("alice")
	PublishDomainEvents(g, context)

	if want := []domain.Event{GreetedEvent{Name: "alice"}}; !reflect.DeepEqual(bus.published, want) {
		t.Errorf("published: got %v, want %v", bus.published, want)
	}
	if pending := unitOfWork.outbox.Pending(); len(pending) != 0 {
		t.Errorf("the outbox should have been relayed at once, got %v", pending)
	}
	if left := g.PullDomainEvents(); len(left) != 0 {
		t.Errorf("the aggregate should have been emptied, got %v", left)
	}
}

func TestGoesStraightToTheBusOnceTheUseCaseHasSucceededWhenThereIsNoUnitOfWorkHenceNoOutbox(t *testing.T) {
	bus := &recordingBus{}
	context := NewExecutionContext(Options{TraceID: "trace", EventBus: bus})
	g := newGreeter("g")

	_, err := Transaction(context, func() (nothing, error) {
		g.greet("alice")
		PublishDomainEvents(g, context)
		if len(bus.published) != 0 {
			t.Errorf("nothing should be published before the use case succeeded, got %v", bus.published)
		}
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []domain.Event{GreetedEvent{Name: "alice"}}; !reflect.DeepEqual(bus.published, want) {
		t.Errorf("published: got %v, want %v", bus.published, want)
	}
}

func TestPublishesAtOnceOutsideOfAnyTransactionWithoutAUnitOfWork(t *testing.T) {
	bus := &recordingBus{}
	context := NewExecutionContext(Options{TraceID: "trace", EventBus: bus})
	g := newGreeter("g")

	g.greet("alice")
	PublishDomainEvents(g, context)

	if want := []domain.Event{GreetedEvent{Name: "alice"}}; !reflect.DeepEqual(bus.published, want) {
		t.Errorf("published: got %v, want %v", bus.published, want)
	}
}
