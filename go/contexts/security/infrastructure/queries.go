package infrastructure

import (
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/security/domain/account"
)

// InMemoryAccountQueries is the read side over the same store as the repository: each method
// shapes a read model from the snapshots (ADR 5, QUERY-READ-MODELS).
type InMemoryAccountQueries struct {
	store *infrastructure.InMemoryDataSource[account.Snapshot]
}

func NewInMemoryAccountQueries(store *infrastructure.InMemoryDataSource[account.Snapshot]) *InMemoryAccountQueries {
	return &InMemoryAccountQueries{store: store}
}

func (q *InMemoryAccountQueries) FindByID(id string) (*account.Detail, error) {
	snapshot, ok := q.store.Get(id)
	if !ok {
		return nil, nil
	}
	// The read model deliberately leaves the credentials behind.
	return &account.Detail{
		ID:                  snapshot.ID,
		Email:               snapshot.Email,
		Role:                snapshot.Role,
		Status:              snapshot.Status,
		LastAuthenticatedAt: snapshot.LastAuthenticatedAt,
	}, nil
}
