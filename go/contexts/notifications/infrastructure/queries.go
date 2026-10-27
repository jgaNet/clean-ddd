package infrastructure

import (
	"maps"
	"slices"

	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/notifications/domain/notification"
)

// InMemoryNotificationQueries is the read side over the in-memory store: each method shapes a
// read model from the snapshots; the attempts never leave the store (QUERY-READ-MODELS). Newest
// first is the order the port promises.
type InMemoryNotificationQueries struct {
	store *infrastructure.InMemoryDataSource[notification.Snapshot]
}

func NewInMemoryNotificationQueries(store *infrastructure.InMemoryDataSource[notification.Snapshot]) *InMemoryNotificationQueries {
	return &InMemoryNotificationQueries{store: store}
}

func toListItem(n notification.Snapshot) notification.ListItem {
	return notification.ListItem{
		ID:           n.ID,
		RecipientID:  n.RecipientID,
		Title:        n.Title,
		Content:      n.Content,
		Status:       n.Status,
		Channels:     slices.Clone(n.Channels),
		CreatedAt:    n.CreatedAt,
		DeliveredVia: n.DeliveredVia,
		SentAt:       n.SentAt,
		ReadAt:       n.ReadAt,
		Metadata:     maps.Clone(n.Metadata),
	}
}

func (q *InMemoryNotificationQueries) FindByRecipient(recipientID string, filters notification.InboxFilters) ([]notification.ListItem, error) {
	inbox := q.inbox(recipientID, filters.OnlyUnread)
	slices.SortStableFunc(inbox, func(a, b notification.Snapshot) int { return b.CreatedAt.Compare(a.CreatedAt) })

	limit := filters.Limit
	if limit <= 0 {
		limit = notification.DefaultInboxLimit
	}
	from := min(max(filters.Offset, 0), len(inbox))
	to := min(from+limit, len(inbox))

	items := make([]notification.ListItem, 0, to-from)
	for _, n := range inbox[from:to] {
		items = append(items, toListItem(n))
	}
	return items, nil
}

func (q *InMemoryNotificationQueries) CountByRecipient(recipientID string, onlyUnread bool) (int, error) {
	return len(q.inbox(recipientID, onlyUnread)), nil
}

// inbox is the recipient's notifications; unread means delivered and not read yet.
func (q *InMemoryNotificationQueries) inbox(recipientID string, onlyUnread bool) []notification.Snapshot {
	inbox := []notification.Snapshot{}
	for _, n := range q.store.All() {
		if n.RecipientID == recipientID && (!onlyUnread || n.Status == notification.StatusSent) {
			inbox = append(inbox, n)
		}
	}
	return inbox
}
