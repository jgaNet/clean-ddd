package infrastructure

import "errors"

// InMemoryUnitOfWork is the transaction boundary over the in-memory stores. BeginTransaction
// snapshots every store it was given (by default every store of the process),
// CommitTransaction drops the snapshots, and RollbackTransaction puts the stores back as they
// were: after a rollback, nothing the transaction saved remains, which is what
// application.Transaction promises.
//
// Honest limit: the snapshot is of the whole store, so two transactions interleaving writes are
// not isolated from each other; a rollback undoes everything written since it began, including
// another request's work. What these four methods give you is a transaction *boundary*, not
// isolation. A database gives both, through the same four methods (ADR 3). One instance per
// request: see the bootstrap. Misuse (two begins, a commit with nothing open) is a programming
// error and is reported as one.
type InMemoryUnitOfWork struct {
	stores  []Snapshotter
	restore []func()
	active  bool
}

// NewInMemoryUnitOfWork guards the given stores, or every store of the process when given none.
func NewInMemoryUnitOfWork(stores ...Snapshotter) *InMemoryUnitOfWork {
	if len(stores) == 0 {
		stores = AllStores()
	}
	return &InMemoryUnitOfWork{stores: stores}
}

func (u *InMemoryUnitOfWork) BeginTransaction() error {
	if u.active {
		return errors.New("transaction already in progress")
	}
	u.restore = u.restore[:0]
	for _, store := range u.stores {
		u.restore = append(u.restore, store.Snapshot())
	}
	u.active = true
	return nil
}

func (u *InMemoryUnitOfWork) CommitTransaction() error {
	if !u.active {
		return errors.New("no active transaction to commit")
	}
	u.restore, u.active = nil, false
	return nil
}

func (u *InMemoryUnitOfWork) RollbackTransaction() error {
	if !u.active {
		return errors.New("no active transaction to rollback")
	}
	for _, restore := range u.restore {
		restore()
	}
	u.restore, u.active = nil, false
	return nil
}

func (u *InMemoryUnitOfWork) HasActiveTransaction() bool { return u.active }
