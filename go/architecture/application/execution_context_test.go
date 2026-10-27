package application

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/domain"
)

// noBus is the bus of a context that never publishes: these tests have nothing to route.
type noBus struct{}

func (noBus) Connect() error { return nil }
func (noBus) Publish(domain.Event, *ExecutionContext) *Operation {
	panic("not used")
}
func (noBus) Dispatch(*Operation)          { panic("not used") }
func (noBus) Subscribe(string, Subscriber) {}

// fakeUnitOfWork records the order of things, so a test can see what happened before what.
type fakeUnitOfWork struct {
	active bool
	log    []string
}

func (u *fakeUnitOfWork) BeginTransaction() error {
	u.active = true
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
	u.log = append(u.log, "rollback")
	return nil
}

func (u *fakeUnitOfWork) HasActiveTransaction() bool { return u.active }

func contextWith(unitOfWork UnitOfWork) *ExecutionContext {
	return NewExecutionContext(Options{TraceID: "trace", EventBus: noBus{}, Auth: Auth{}, UnitOfWork: unitOfWork})
}

func contextWithout() *ExecutionContext {
	return NewExecutionContext(Options{TraceID: "trace", EventBus: noBus{}})
}

type nothing struct{}

func TestRunsTheCallbackOnlyOnceTheTransactionIsCommitted(t *testing.T) {
	unitOfWork := &fakeUnitOfWork{}
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

func TestDropsTheCallbackWhenTheTransactionFails(t *testing.T) {
	unitOfWork := &fakeUnitOfWork{}
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
	unitOfWork := &fakeUnitOfWork{}
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

func TestRunsTheCallbackAtTheOutermostCommitWhenTransactionsAreNested(t *testing.T) {
	unitOfWork := &fakeUnitOfWork{}
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
	unitOfWork := &fakeUnitOfWork{}
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
		order = append(order, "work")
		return nothing{}, nil
	})
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if want := []string{"work", "callback"}; !reflect.DeepEqual(order, want) {
		t.Errorf("order: got %v, want %v", order, want)
	}
}

func TestTheContextCarriesWhatExistsPerRequestAndLogsSilentlyWithoutALogger(t *testing.T) {
	unitOfWork := &fakeUnitOfWork{}
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
