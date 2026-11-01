package infrastructure

import (
	"reflect"
	"sync"
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

// The relay acknowledges an outbox entry once every reaction it reached has committed, never
// sooner (ADR 24): a process that dies while a reaction runs has not lost the fact, and the next
// relay hands it out again to the subscribers that had not handled it yet.

type BookingConfirmedEvent struct {
	domain.DomainEvent
	BookingID string
}

// tellTheHost is a reaction that waits until the test lets it finish, when it holds one, and
// fails while failing says so.
type tellTheHost struct {
	mu      sync.Mutex
	handled int
	failing bool
	started chan struct{}
	release chan struct{}
}

func (r *tellTheHost) Execute(BookingConfirmedEvent, *application.ExecutionContext) error {
	r.mu.Lock()
	r.handled++
	failing := r.failing
	r.mu.Unlock()
	if r.started != nil {
		r.started <- struct{}{}
		<-r.release
	}
	if failing {
		return domain.NotFound("Test", "the service refused", nil)
	}
	return nil
}

func (r *tellTheHost) times() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.handled
}

func (r *tellTheHost) fail(failing bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.failing = failing
}

func TestTheRelayKeepsAnEntryPendingWhileAReactionToItRunsAndHandsItOutOnceMeanwhile(t *testing.T) {
	bus := NewInMemoryEventBus()
	reaction := &tellTheHost{started: make(chan struct{}), release: make(chan struct{})}
	subscribe(bus, application.Reaction[BookingConfirmedEvent](reaction))
	outbox := NewInMemoryOutbox()
	context := contextOn(bus)
	entries := outbox.Append([]domain.Event{BookingConfirmedEvent{BookingID: "b-1"}})

	application.RelayOutbox(outbox, bus, context)
	<-reaction.started
	// The reaction has not committed: a crash now must find the fact still owed.
	if pending := outbox.Pending(); !reflect.DeepEqual(pending, entries) {
		t.Errorf("pending while the reaction runs: got %v, want %v", pending, entries)
	}
	// A second relay (the next commit's) does not hand out an entry already on its way.
	if handed := application.RelayOutbox(outbox, bus, context); len(handed) != 0 {
		t.Errorf("a second relay handed out %v, an entry already on its way", handed)
	}

	close(reaction.release)
	bus.Settle()
	if pending := outbox.Pending(); len(pending) != 0 {
		t.Errorf("pending once the reaction committed: got %v, want nothing", pending)
	}
	if reaction.times() != 1 {
		t.Errorf("the reaction ran %d times, want once", reaction.times())
	}
}

// Each subscriber's inbox is its own verdict, whichever subscriber ends the dispatch: the one
// that failed first, or the one that succeeded first.
func TestTheRelayKeepsAnEntryWhoseReactionFailedPendingAndHandsItAgainToThatSubscriberOnly(t *testing.T) {
	for _, refusedFirst := range []bool{false, true} {
		name := map[bool]string{false: "told, then refused", true: "refused, then told"}[refusedFirst]
		t.Run(name, func(t *testing.T) {
			bus := NewInMemoryEventBus()
			told, refused := &tellTheHost{}, &tellTheHost{}
			order := []*tellTheHost{told, refused}
			if refusedFirst {
				order = []*tellTheHost{refused, told}
			}
			for _, reaction := range order {
				subscribe(bus, application.Reaction[BookingConfirmedEvent](reaction))
			}
			outbox := NewInMemoryOutbox()
			context := contextOn(bus)
			entries := outbox.Append([]domain.Event{BookingConfirmedEvent{BookingID: "b-2"}})

			refused.fail(true)
			application.RelayOutbox(outbox, bus, context)
			bus.Settle()
			if pending := outbox.Pending(); !reflect.DeepEqual(pending, entries) {
				t.Errorf("pending after a reaction failed: got %v, want %v", pending, entries)
			}

			refused.fail(false)
			application.RelayOutbox(outbox, bus, context)
			bus.Settle()
			if pending := outbox.Pending(); len(pending) != 0 {
				t.Errorf("pending once every reaction succeeded: got %v, want nothing", pending)
			}
			if got := []int{told.times(), refused.times()}; !reflect.DeepEqual(got, []int{1, 2}) {
				t.Errorf("handled [told refused]: got %v, want [1 2]", got)
			}
		})
	}
}
