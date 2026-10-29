package infrastructure

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
)

// The outbox port, held by its in-memory adapter: what is appended is pending, in order, until
// it is published; and it lives and dies with the transaction (ADR 24).

type greeter struct{ domain.AggregateRoot }

func (g *greeter) greet(name string) { g.Record(GreetedEvent{Name: name}) }

func names(entries []application.OutboxEntry) []string {
	out := []string{}
	for _, entry := range entries {
		out = append(out, entry.Event.(GreetedEvent).Name)
	}
	return out
}

func TestKeepsWhatIsAppendedPendingOldestFirstUntilItIsMarkedPublished(t *testing.T) {
	outbox := NewInMemoryOutbox()
	entries := outbox.Append([]domain.Event{GreetedEvent{Name: "alice"}, GreetedEvent{Name: "bob"}})

	if len(entries) != 2 || entries[0].ID == entries[1].ID || entries[0].ID == "" {
		t.Fatalf("two entries with their own ids, got %v", entries)
	}
	if pending := outbox.Pending(); !reflect.DeepEqual(pending, entries) {
		t.Errorf("pending: got %v, want %v", pending, entries)
	}

	outbox.MarkPublished(entries[0].ID)
	if pending := outbox.Pending(); !reflect.DeepEqual(pending, entries[1:]) {
		t.Errorf("pending after one delivery: got %v, want %v", pending, entries[1:])
	}
}

func TestIsRolledBackWithTheTransactionThatAppendedToItAndKeptByOneThatCommits(t *testing.T) {
	outbox := NewInMemoryOutbox()
	unitOfWork := NewInMemoryUnitOfWorkWith(outbox, NewInMemoryDataSource[string]())

	if err := unitOfWork.BeginTransaction(); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	outbox.Append([]domain.Event{GreetedEvent{Name: "rolled back"}})
	if err := unitOfWork.RollbackTransaction(); err != nil {
		t.Fatalf("Rollback: %v", err)
	}
	if pending := outbox.Pending(); len(pending) != 0 {
		t.Errorf("pending after a rollback: got %v, want nothing", pending)
	}

	if err := unitOfWork.BeginTransaction(); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	outbox.Append([]domain.Event{GreetedEvent{Name: "committed"}})
	if err := unitOfWork.CommitTransaction(); err != nil {
		t.Fatalf("Commit: %v", err)
	}
	if got := names(outbox.Pending()); !reflect.DeepEqual(got, []string{"committed"}) {
		t.Errorf("pending after a commit: got %v, want [committed]", got)
	}
	if unitOfWork.Outbox() != application.Outbox(outbox) {
		t.Error("the unit of work should hand out the outbox it guards")
	}
}

func TestTheRealPiecesStoreAtCommitAndPublishAfterItUnderTheEntrysID(t *testing.T) {
	outbox := NewInMemoryOutbox()
	bus := NewInMemoryEventBus()
	var delivered []string
	bus.Subscribe("GreetedEvent", subscriber(func(operation *application.Operation) {
		delivered = append(delivered, operation.ID)
		operation.Sent()
	}))
	context := application.NewExecutionContext(application.Options{
		TraceID: "trace", EventBus: bus, UnitOfWork: NewInMemoryUnitOfWorkWith(outbox, NewInMemoryDataSource[string]()),
	})
	g := &greeter{AggregateRoot: domain.NewAggregateRoot(domain.NewID("g"), 0)}

	var stored []string
	_, err := application.Transaction(context, func() (struct{}, error) {
		g.greet("alice")
		application.PublishDomainEvents(g, context)
		context.BeforeCommit(func() {
			for _, entry := range outbox.Pending() {
				stored = append(stored, entry.ID)
			}
		})
		return struct{}{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	bus.Settle()

	if len(stored) != 1 || !reflect.DeepEqual(delivered, stored) {
		t.Errorf("delivered under %v, want the stored entry's id %v", delivered, stored)
	}
	if pending := outbox.Pending(); len(pending) != 0 {
		t.Errorf("the outbox should have been relayed, got %v", pending)
	}
}
