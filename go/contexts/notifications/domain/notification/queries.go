package notification

import "time"

// Read models: what an inbox shows. Plain data, tailored to the screen, never coming back into
// the domain. The attempts stay inside the aggregate (QUERY-READ-MODELS, ADR 5).

type ListItem struct {
	ID          string
	RecipientID string
	Title       string
	Content     string
	Status      Status
	Channels    []Channel
	CreatedAt   time.Time
	// DeliveredVia is empty, and SentAt and ReadAt nil, until the fact happened.
	DeliveredVia Channel
	SentAt       *time.Time
	ReadAt       *time.Time
	Metadata     map[string]any
}

// DefaultInboxLimit is the page size when the filters name none (a zero Limit).
const DefaultInboxLimit = 20

// InboxFilters is the page of an inbox: a window, and whether to keep only what was delivered
// and not read yet.
type InboxFilters struct {
	Limit      int
	Offset     int
	OnlyUnread bool
}

type Queries interface {
	// FindByRecipient lists newest first; OnlyUnread keeps the delivered ones not read yet.
	// Ordering is part of this contract.
	FindByRecipient(recipientID string, filters InboxFilters) ([]ListItem, error)
	CountByRecipient(recipientID string, onlyUnread bool) (int, error)
}
