package infrastructure

import (
	"strings"

	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/security/domain/account"
)

// InMemoryAccountRepository is the repository port on the in-memory store: a snapshot in, a
// snapshot out. It knows nothing of the aggregate's rules (FromSnapshot and ToSnapshot are
// the aggregate's). Save is where optimistic concurrency is enforced (ADR 8, CONC-OPTIMISTIC):
// the stored version must still be the one the aggregate was read at, and the store gets
// version + 1.

func staleAccount(accountID string, read, stored int) *domain.Exception {
	return domain.ConcurrencyConflict(account.Service, "The account changed since it was read",
		map[string]any{"accountId": accountID, "read": read, "stored": stored})
}

type InMemoryAccountRepository struct {
	store *infrastructure.InMemoryDataSource[account.Snapshot]
}

func NewInMemoryAccountRepository(store *infrastructure.InMemoryDataSource[account.Snapshot]) *InMemoryAccountRepository {
	return &InMemoryAccountRepository{store: store}
}

func (r *InMemoryAccountRepository) FindByID(id string) (*account.Account, error) {
	snapshot, ok := r.store.Get(id)
	if !ok {
		return nil, nil
	}
	return account.FromSnapshot(snapshot), nil
}

func (r *InMemoryAccountRepository) FindByEmail(email string) (*account.Account, error) {
	wanted := strings.ToLower(strings.TrimSpace(email))
	for _, snapshot := range r.store.All() {
		if snapshot.Email == wanted {
			return account.FromSnapshot(snapshot), nil
		}
	}
	return nil, nil
}

func (r *InMemoryAccountRepository) Save(a *account.Account) error {
	id := a.ID().Value()
	return r.store.Modify(id, func(stored account.Snapshot, exists bool) (account.Snapshot, error) {
		if exists && stored.Version != a.Version() {
			return stored, staleAccount(id, a.Version(), stored.Version)
		}
		snapshot := a.ToSnapshot()
		snapshot.Version = a.Version() + 1
		return snapshot, nil
	})
}
