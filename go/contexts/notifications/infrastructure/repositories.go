package infrastructure

import (
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/notifications/domain/notification"
)

// InMemoryNotificationRepository is the repository port on the in-memory store: a snapshot in,
// a snapshot out, attempts included. It knows nothing of the aggregate's rules (FromSnapshot
// and ToSnapshot are the aggregate's) and offers only what a use case needs to change one
// aggregate; the inbox is the queries' job, on the same store.
//
// Save is where optimistic concurrency is enforced (ADR 8, CONC-OPTIMISTIC): the stored version
// must still be the one the aggregate was read at, and the store gets version + 1.
type InMemoryNotificationRepository struct {
	store *infrastructure.InMemoryDataSource[notification.Snapshot]
}

func NewInMemoryNotificationRepository(store *infrastructure.InMemoryDataSource[notification.Snapshot]) *InMemoryNotificationRepository {
	return &InMemoryNotificationRepository{store: store}
}

func staleNotification(notificationID string, read, stored int) *domain.Exception {
	return domain.ConcurrencyConflict(notification.Service, "The notification changed since it was read",
		map[string]any{"notificationId": notificationID, "read": read, "stored": stored})
}

func (r *InMemoryNotificationRepository) FindByID(id string) (*notification.Notification, error) {
	snapshot, ok := r.store.Get(id)
	if !ok {
		return nil, nil
	}
	return notification.FromSnapshot(snapshot), nil
}

func (r *InMemoryNotificationRepository) Save(n *notification.Notification) error {
	id := n.ID().Value()
	return r.store.Modify(id, func(stored notification.Snapshot, exists bool) (notification.Snapshot, error) {
		if exists && stored.Version != n.Version() {
			return stored, staleNotification(id, n.Version(), stored.Version)
		}
		snapshot := n.ToSnapshot()
		snapshot.Version = n.Version() + 1
		return snapshot, nil
	})
}
