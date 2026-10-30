package application_test

import (
	"slices"
	"sync"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
)

// A reaction's transaction is its own (ADR 30): what it saves and what it tells other contexts
// commit together, or neither does. The in-memory store, outbox and unit of work are the real
// ones; the bus records what reached it, under which id, and what was saved by then.

type greetedEvent struct {
	domain.DomainEvent
	Then string
}

type toldIntegrationEvent struct {
	domain.IntegrationEvent
	Who string
}

// onGreetedSaveAndTell saves one row per person and tells other contexts about each, failing
// after the second save and the second fact when the greeting says so.
type onGreetedSaveAndTell struct {
	store *infrastructure.InMemoryDataSource[string]
}

func (h onGreetedSaveAndTell) Execute(event greetedEvent, ctx *application.ExecutionContext) error {
	for _, who := range []string{"ann", "bob"} {
		h.store.Set(who, "told")
		application.PublishIntegrationEvent(toldIntegrationEvent{Who: who}, ctx)
		if event.Then == "fail" && who == "bob" {
			return domain.NotFound("Test", "bob is gone", nil)
		}
	}
	return nil
}

// published is one message the bus received: the fact, the id it carried, what was saved by then.
type published struct {
	who   string
	id    string
	saved []string
}

type recordingBus struct {
	mu        sync.Mutex
	store     *infrastructure.InMemoryDataSource[string]
	published []published
}

func (*recordingBus) Connect() error { return nil }

func (b *recordingBus) Publish(event domain.Event, context *application.ExecutionContext) *application.Operation {
	return b.PublishWithID(event, context, "")
}

func (b *recordingBus) PublishWithID(event domain.Event, context *application.ExecutionContext, id string) *application.Operation {
	b.mu.Lock()
	defer b.mu.Unlock()
	saved := []string{}
	for _, who := range []string{"ann", "bob"} {
		if _, ok := b.store.Get(who); ok {
			saved = append(saved, who)
		}
	}
	b.published = append(b.published, published{who: event.(toldIntegrationEvent).Who, id: id, saved: saved})
	return application.NewOperationWithID(id, event, context)
}

func (*recordingBus) Dispatch(*application.Operation)          {}
func (*recordingBus) Subscribe(string, application.Subscriber) {}

type reactionSetup struct {
	store      *infrastructure.InMemoryDataSource[string]
	outbox     *infrastructure.InMemoryOutbox
	unitOfWork *infrastructure.InMemoryUnitOfWork
	bus        *recordingBus
	// context is the publisher's: the one the fact travelled with.
	context *application.ExecutionContext
}

func setupReaction() reactionSetup {
	store := infrastructure.NewInMemoryDataSource[string]()
	outbox := infrastructure.NewInMemoryOutbox()
	unitOfWork := infrastructure.NewInMemoryUnitOfWorkWith(outbox, store)
	bus := &recordingBus{store: store}
	context := application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus, UnitOfWork: unitOfWork})
	return reactionSetup{store: store, outbox: outbox, unitOfWork: unitOfWork, bus: bus, context: context}
}

func (s reactionSetup) react(then string) *application.Operation {
	operation := application.NewOperation(greetedEvent{Then: then}, s.context)
	application.Reaction[greetedEvent](onGreetedSaveAndTell{store: s.store}).Handlers[0].Handle(operation)
	return operation
}

func TestAReactionCommitsWhatItSavedAndTellsOtherContextsAfterTheCommitThroughTheOutboxUnderTheEntryIDs(t *testing.T) {
	s := setupReaction()

	done := s.react("")

	if done.Status != application.StatusSent {
		t.Fatalf("status: got %s, want SENT (%+v)", done.Status, done.Error)
	}
	if saved := s.store.All(); len(saved) != 2 {
		t.Errorf("saved: got %v, want ann and bob", saved)
	}
	if len(s.bus.published) != 2 {
		t.Fatalf("published: got %+v, want two facts", s.bus.published)
	}
	for i, who := range []string{"ann", "bob"} {
		message := s.bus.published[i]
		if message.who != who {
			t.Errorf("message %d: got %s, want %s", i, message.who, who)
		}
		if message.id == "" {
			t.Errorf("message %d went out without the entry's id: not through the outbox", i)
		}
		if !slices.Equal(message.saved, []string{"ann", "bob"}) {
			t.Errorf("message %d went out before the commit: saved by then %v", i, message.saved)
		}
	}
	if s.bus.published[0].id == s.bus.published[1].id {
		t.Errorf("two facts under one id: %s", s.bus.published[0].id)
	}
	if pending := s.outbox.Pending(); len(pending) != 0 {
		t.Errorf("outbox: got %v pending, want nothing", pending)
	}
}

func TestAReactionThatFailsHalfWayLeavesNothingSavedAndNothingToldSoASecondDeliveryStartsClean(t *testing.T) {
	s := setupReaction()

	done := s.react("fail")

	if done.Status != application.StatusError || done.Error == nil || done.Error.Type != domain.TypeNotFound {
		t.Fatalf("got %s %+v, want ERROR NotFound", done.Status, done.Error)
	}
	if saved := s.store.All(); len(saved) != 0 {
		t.Errorf("saved: got %v, want nothing", saved)
	}
	if len(s.bus.published) != 0 {
		t.Errorf("published: got %+v, want nothing", s.bus.published)
	}
	if pending := s.outbox.Pending(); len(pending) != 0 {
		t.Errorf("outbox: got %v pending, want nothing", pending)
	}
}

func TestAReactionRunsBesideAnotherReactionToTheSameFactAndBesideTheOpenTransactionThatPublishedIt(t *testing.T) {
	s := setupReaction()
	// The publisher's transaction, still open while it relays.
	if err := s.unitOfWork.BeginTransaction(); err != nil {
		t.Fatal(err)
	}

	operations := make([]*application.Operation, 2)
	var wg sync.WaitGroup
	for i := range operations {
		wg.Add(1)
		go func() {
			defer wg.Done()
			operations[i] = s.react("")
		}()
	}
	wg.Wait()

	for i, operation := range operations {
		if operation.Status != application.StatusSent {
			t.Errorf("reaction %d: got %s %+v, want SENT", i, operation.Status, operation.Error)
		}
	}
	if !s.unitOfWork.HasActiveTransaction() {
		t.Error("the publisher's transaction is its own: no reaction may have closed it")
	}
}
