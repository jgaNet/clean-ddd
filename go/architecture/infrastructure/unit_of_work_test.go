package infrastructure

import (
	"reflect"
	"testing"
)

func TestARollbackPutsEveryStoreBackAsItWas(t *testing.T) {
	notes := NewInMemoryDataSource[string]()
	accounts := NewInMemoryDataSource[string]()
	notes.Set("n1", "kept")
	unitOfWork := NewInMemoryUnitOfWork(notes, accounts)

	if err := unitOfWork.BeginTransaction(); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	notes.Set("n2", "written inside")
	accounts.Set("a1", "written inside")
	if err := unitOfWork.RollbackTransaction(); err != nil {
		t.Fatalf("Rollback: %v", err)
	}

	if all := notes.All(); !reflect.DeepEqual(all, []string{"kept"}) {
		t.Errorf("notes: got %v, want [kept]", all)
	}
	if _, exists := notes.Get("n2"); exists {
		t.Error("n2 should have been rolled back")
	}
	if all := accounts.All(); len(all) != 0 {
		t.Errorf("accounts: got %v, want nothing", all)
	}
	if unitOfWork.HasActiveTransaction() {
		t.Error("no transaction should be active after a rollback")
	}
}

func TestACommitKeepsWhatWasWritten(t *testing.T) {
	notes := NewInMemoryDataSource[string]()
	unitOfWork := NewInMemoryUnitOfWork(notes)

	if err := unitOfWork.BeginTransaction(); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if !unitOfWork.HasActiveTransaction() {
		t.Error("a transaction should be active after Begin")
	}
	notes.Set("n1", "written inside")
	if err := unitOfWork.CommitTransaction(); err != nil {
		t.Fatalf("Commit: %v", err)
	}

	if all := notes.All(); !reflect.DeepEqual(all, []string{"written inside"}) {
		t.Errorf("notes: got %v", all)
	}
	if unitOfWork.HasActiveTransaction() {
		t.Error("no transaction should be active after a commit")
	}
}

func TestPinsTheHonestLimitTwoRequestsOverTheSameStoresAreABoundaryEachNotIsolated(t *testing.T) {
	notes := NewInMemoryDataSource[string]()
	accounts := NewInMemoryDataSource[string]()
	notes.Set("n1", "before")
	unitOfWork := NewInMemoryUnitOfWork(notes, accounts)
	other := NewInMemoryUnitOfWork(notes, accounts)

	if err := unitOfWork.BeginTransaction(); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	notes.Set("n1", "first writer")
	if err := other.BeginTransaction(); err != nil {
		t.Fatalf("Begin (other): %v", err)
	}
	notes.Set("n2", "second writer")
	if err := other.CommitTransaction(); err != nil {
		t.Fatalf("Commit (other): %v", err)
	}
	if err := unitOfWork.RollbackTransaction(); err != nil {
		t.Fatalf("Rollback: %v", err)
	}

	if n1, _ := notes.Get("n1"); n1 != "before" {
		t.Errorf("n1: got %q, want the value before the first writer", n1)
	}
	// The second writer committed, and its write is gone with the first one's rollback: the
	// snapshot is of the whole store. A database keeps n2 here; the README lists this as the gap
	// it is.
	if _, exists := notes.Get("n2"); exists {
		t.Error("n2 is undone by the other request's rollback: the in-memory stores give a boundary, not isolation")
	}
}

func TestMisuseIsAProgrammingError(t *testing.T) {
	unitOfWork := NewInMemoryUnitOfWork(NewInMemoryDataSource[string]())
	if err := unitOfWork.CommitTransaction(); err == nil || err.Error() != "no active transaction to commit" {
		t.Errorf("Commit without a transaction: got %v", err)
	}
	if err := unitOfWork.RollbackTransaction(); err == nil || err.Error() != "no active transaction to rollback" {
		t.Errorf("Rollback without a transaction: got %v", err)
	}
	if err := unitOfWork.BeginTransaction(); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	if err := unitOfWork.BeginTransaction(); err == nil || err.Error() != "transaction already in progress" {
		t.Errorf("a second Begin: got %v", err)
	}
}

func TestGuardsEveryStoreOfTheProcessWhenGivenNone(t *testing.T) {
	notes := NewInMemoryDataSource[string]()
	unitOfWork := NewInMemoryUnitOfWork()

	if err := unitOfWork.BeginTransaction(); err != nil {
		t.Fatalf("Begin: %v", err)
	}
	notes.Set("n1", "written inside")
	if err := unitOfWork.RollbackTransaction(); err != nil {
		t.Fatalf("Rollback: %v", err)
	}

	if _, exists := notes.Get("n1"); exists {
		t.Error("a store registered in the process should have been rolled back")
	}
}
