package application

import (
	"errors"
	"reflect"
	"strings"
	"testing"

	"clean-ddd/architecture/domain"
)

// noBus is the bus of a context that never publishes: these tests have nothing to route.
type noBus struct{}

func (noBus) Connect() error { return nil }
func (noBus) Publish(domain.Event, *ExecutionContext) *Operation {
	panic("not used")
}
func (noBus) PublishWithID(domain.Event, *ExecutionContext, string) *Operation {
	panic("not used")
}
func (noBus) Dispatch(*Operation)          { panic("not used") }
func (noBus) Subscribe(string, Subscriber) {}

// fakeOutbox keeps its entries in order, and remembers every id it ever gave, so a test can
// see what was stored, what was relayed, and under which id.
type fakeOutbox struct {
	entries  []OutboxEntry
	appended []string
}

func (o *fakeOutbox) Append(events []domain.Event) []OutboxEntry {
	var appended []OutboxEntry
	for _, event := range events {
		entry := OutboxEntry{ID: domain.GenerateID().Value(), Event: event}
		o.entries = append(o.entries, entry)
		o.appended = append(o.appended, entry.ID)
		appended = append(appended, entry)
	}
	return appended
}

func (o *fakeOutbox) Pending() []OutboxEntry { return append([]OutboxEntry(nil), o.entries...) }

func (o *fakeOutbox) MarkPublished(id string) {
	kept := o.entries[:0]
	for _, entry := range o.entries {
		if entry.ID != id {
			kept = append(kept, entry)
		}
	}
	o.entries = kept
}

func (o *fakeOutbox) events() []domain.Event {
	var events []domain.Event
	for _, entry := range o.entries {
		events = append(events, entry.Event)
	}
	return events
}

// fakeUnitOfWork records the order of things, so a test can see what happened before what; its
// outbox lives and dies with the transaction, as the in-memory one does.
type fakeUnitOfWork struct {
	active   bool
	log      []string
	outbox   *fakeOutbox
	snapshot []OutboxEntry
}

func newFakeUnitOfWork() *fakeUnitOfWork { return &fakeUnitOfWork{outbox: &fakeOutbox{}} }

func (u *fakeUnitOfWork) BeginTransaction() error {
	u.active = true
	u.snapshot = u.outbox.Pending()
	u.log = append(u.log, "begin")
	return nil
}

func (u *fakeUnitOfWork) CommitTransaction() error {
	u.active = false
	u.log = append(u.log, "commit")
	return nil
}

func (u *fakeUnitOfWork) RollbackTransaction() error {
	u.active = false
	u.outbox.entries = u.snapshot
	u.log = append(u.log, "rollback")
	return nil
}

func (u *fakeUnitOfWork) HasActiveTransaction() bool { return u.active }

func (u *fakeUnitOfWork) Outbox() Outbox { return u.outbox }

func (u *fakeUnitOfWork) Another() UnitOfWork { return &fakeUnitOfWork{outbox: u.outbox} }

func contextWith(unitOfWork UnitOfWork) *ExecutionContext {
	return NewExecutionContext(Options{TraceID: "trace", EventBus: noBus{}, Auth: Auth{}, UnitOfWork: unitOfWork})
}

func contextWithout() *ExecutionContext {
	return NewExecutionContext(Options{TraceID: "trace", EventBus: noBus{}})
}

type nothing struct{}

func TestRunsTheCallbackOnlyOnceTheTransactionIsCommitted(t *testing.T) {
	unitOfWork := newFakeUnitOfWork()
	context := contextWith(unitOfWork)

	_, err := Transaction(context, func() (nothing, error) {
		context.AfterCommit(func() { unitOfWork.log = append(unitOfWork.log, "callback") })
		unitOfWork.log = append(unitOfWork.log, "work")
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []string{"begin", "work", "commit", "callback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
}

func TestRunsABeforeCommitStepInsideTheTransactionAfterTheWorkAndBeforeTheCommitThenRelaysTheOutbox(t *testing.T) {
	unitOfWork := newFakeUnitOfWork()
	bus := &recordingBus{log: &unitOfWork.log}
	context := NewExecutionContext(Options{TraceID: "trace", EventBus: bus, UnitOfWork: unitOfWork})

	_, err := Transaction(context, func() (nothing, error) {
		context.AfterCommit(func() { unitOfWork.log = append(unitOfWork.log, "callback") })
		context.BeforeCommit(func() {
			unitOfWork.log = append(unitOfWork.log, "before commit")
			unitOfWork.outbox.Append([]domain.Event{GreetedEvent{Name: "fact"}})
		})
		unitOfWork.log = append(unitOfWork.log, "work")
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []string{"begin", "work", "before commit", "commit", "publish", "callback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
	if pending := unitOfWork.outbox.Pending(); len(pending) != 0 {
		t.Errorf("the outbox should have been relayed, got %v", pending)
	}
}

func TestDropsTheBeforeCommitStepWithTheCallbackWhenTheTransactionFails(t *testing.T) {
	unitOfWork := newFakeUnitOfWork()
	context := contextWith(unitOfWork)

	_, err := Transaction(context, func() (nothing, error) {
		context.BeforeCommit(func() { unitOfWork.log = append(unitOfWork.log, "before commit") })
		context.AfterCommit(func() { unitOfWork.log = append(unitOfWork.log, "callback") })
		return nothing{}, domain.Unknown("nope", nil)
	})
	if refused, ok := domain.Refusal(err); !ok || refused.Message != "nope" {
		t.Errorf("the refusal should come back as is, got %v", err)
	}
	if want := []string{"begin", "rollback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
}

func TestDropsTheCallbackWhenTheTransactionFails(t *testing.T) {
	unitOfWork := newFakeUnitOfWork()
	context := contextWith(unitOfWork)

	_, err := Transaction(context, func() (nothing, error) {
		context.AfterCommit(func() { unitOfWork.log = append(unitOfWork.log, "callback") })
		return nothing{}, domain.Unknown("nope", nil)
	})
	if refused, ok := domain.Refusal(err); !ok || refused.Message != "nope" {
		t.Errorf("the refusal should come back as is, got %v", err)
	}
	if want := []string{"begin", "rollback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
}

func TestDropsTheCallbackWhenTheTransactionPanics(t *testing.T) {
	unitOfWork := newFakeUnitOfWork()
	context := contextWith(unitOfWork)

	_, err := Transaction(context, func() (nothing, error) {
		context.AfterCommit(func() { unitOfWork.log = append(unitOfWork.log, "callback") })
		panic("boom")
	})
	refused, ok := domain.Refusal(err)
	if !ok || refused.Type != domain.TypeUnknown || refused.Message != "boom" {
		t.Errorf("a panic should become an Unknown failure, got %v", err)
	}
	if want := []string{"begin", "rollback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
}

// unitOfWorkThatCannotRollBack is the fake whose connection is gone when it should roll back, once.
type unitOfWorkThatCannotRollBack struct {
	*fakeUnitOfWork
	failing bool
}

func (u *unitOfWorkThatCannotRollBack) RollbackTransaction() error {
	if err := u.fakeUnitOfWork.RollbackTransaction(); err != nil {
		return err
	}
	if u.failing {
		return errors.New("the connection is gone")
	}
	return nil
}

func TestKeepsNothingFromATransactionWhoseUnitOfWorkCouldNotRollBackTheContextIsCleanForTheNextOne(t *testing.T) {
	unitOfWork := &unitOfWorkThatCannotRollBack{fakeUnitOfWork: newFakeUnitOfWork(), failing: true}
	context := contextWith(unitOfWork)

	_, err := Transaction(context, func() (nothing, error) {
		context.BeforeCommit(func() { unitOfWork.log = append(unitOfWork.log, "stale step") })
		context.AfterCommit(func() { unitOfWork.log = append(unitOfWork.log, "stale callback") })
		return nothing{}, errors.New("refused")
	})
	if err == nil || err.Error() != "the connection is gone" {
		t.Fatalf("the rollback failure should be reported, got %v", err)
	}

	unitOfWork.failing = false
	_, err = Transaction(context, func() (nothing, error) {
		context.AfterCommit(func() { unitOfWork.log = append(unitOfWork.log, "callback") })
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []string{"begin", "rollback", "begin", "commit", "callback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
}

func TestOwnsItsTransactionAUnitOfWorkThatAlreadyHasOneOpenAtTheOutermostCallIsAProgrammingError(t *testing.T) {
	unitOfWork := newFakeUnitOfWork()
	unitOfWork.active = true
	context := contextWith(unitOfWork)
	calls := 0
	fn := func() (nothing, error) {
		calls++
		return nothing{}, nil
	}

	_, err := Transaction(context, fn)
	refused, ok := domain.Refusal(err)
	if !ok || refused.Type != domain.TypeUnknown || !strings.Contains(refused.Message, "the context owns its transaction") {
		t.Fatalf("a transaction already open should be refused as a programming error, got %v", err)
	}
	if calls != 0 {
		t.Error("the work should never have run")
	}
	if len(unitOfWork.log) != 0 {
		t.Errorf("nothing should have happened to the unit of work, got %v", unitOfWork.log)
	}

	unitOfWork.active = false
	if _, err := Transaction(context, fn); err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []string{"begin", "commit"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
}

func TestRunsTheCallbackAtTheOutermostCommitWhenTransactionsAreNested(t *testing.T) {
	unitOfWork := newFakeUnitOfWork()
	context := contextWith(unitOfWork)

	inner := func() (nothing, error) {
		context.AfterCommit(func() { unitOfWork.log = append(unitOfWork.log, "inner callback") })
		return nothing{}, nil
	}
	_, err := Transaction(context, func() (nothing, error) {
		if _, err := Transaction(context, inner); err != nil {
			return nothing{}, err
		}
		unitOfWork.log = append(unitOfWork.log, "outer work")
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []string{"begin", "outer work", "commit", "inner callback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
}

func TestAnInnerFailureRollsBackTheOuterTransaction(t *testing.T) {
	unitOfWork := newFakeUnitOfWork()
	context := contextWith(unitOfWork)

	_, err := Transaction(context, func() (nothing, error) {
		context.AfterCommit(func() { unitOfWork.log = append(unitOfWork.log, "outer callback") })
		return Transaction(context, func() (nothing, error) {
			return nothing{}, domain.NotAllowed("Test", "refused", nil)
		})
	})
	if !domain.IsNotAllowed(err) {
		t.Errorf("the inner refusal should come back, got %v", err)
	}
	if want := []string{"begin", "rollback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
}

func TestRunsTheCallbackImmediatelyOutsideOfATransaction(t *testing.T) {
	context := contextWithout()
	var calls []string
	context.AfterCommit(func() { calls = append(calls, "callback") })
	if !reflect.DeepEqual(calls, []string{"callback"}) {
		t.Errorf("calls: got %v", calls)
	}
}

func TestStillDefersTheCallbackWithoutAUnitOfWorkUntilTheFunctionSucceeds(t *testing.T) {
	context := contextWithout()
	var order []string

	_, err := Transaction(context, func() (nothing, error) {
		context.AfterCommit(func() { order = append(order, "callback") })
		context.BeforeCommit(func() { order = append(order, "before commit") })
		order = append(order, "work")
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []string{"work", "before commit", "callback"}; !reflect.DeepEqual(order, want) {
		t.Errorf("order: got %v, want %v", order, want)
	}
}

func TestTheContextCarriesWhatExistsPerRequestAndLogsSilentlyWithoutALogger(t *testing.T) {
	unitOfWork := newFakeUnitOfWork()
	context := NewExecutionContext(Options{
		TraceID: "trace-1", Auth: Auth{SubjectID: "alice", Role: "USER"}, EventBus: noBus{}, UnitOfWork: unitOfWork,
	})
	if context.TraceID() != "trace-1" || context.Auth() != (Auth{SubjectID: "alice", Role: "USER"}) {
		t.Error("the context should carry the trace and the caller it was built with")
	}
	if context.EventBus() != (noBus{}) || context.UnitOfWork() != UnitOfWork(unitOfWork) {
		t.Error("the context should carry the bus and the unit of work it was built with")
	}
	if context.Logger() != nil {
		t.Error("no logger was given")
	}
	context.Log().Info("nothing listens", nil) // must not panic
}
