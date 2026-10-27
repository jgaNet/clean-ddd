package notification

import "time"

// Snapshot is the plain data the aggregate is persisted as and rebuilt from, attempts
// included: the aggregate is persisted as a whole. The aggregate (notification.go) owns the
// behaviour and the rules; these types own nothing. The snapshot is the only shape that
// crosses the domain boundary towards the infrastructure.
type Snapshot struct {
	ID          string
	RecipientID string
	Title       string
	Content     string
	Channels    []Channel
	Status      Status
	CreatedAt   time.Time
	Metadata    map[string]any
	Attempts    []DeliveryAttemptSnapshot
	// SentAt and ReadAt are nil until the notification was delivered, then read.
	SentAt *time.Time
	ReadAt *time.Time
	// DeliveredVia is the channel that accepted the notification; empty until one did.
	DeliveredVia Channel
	// Version is the one this snapshot was read at; the repository stores version + 1 (ADR 8).
	Version int
}

// DeliveryAttemptSnapshot is a child entity as it is persisted, inside its notification.
type DeliveryAttemptSnapshot struct {
	ID        string
	Channel   Channel
	At        time.Time
	Succeeded bool
}

// NewNotification is what is needed to send a new notification.
type NewNotification struct {
	RecipientID string
	Title       string
	Content     string
	Channels    []Channel
	// Metadata is whatever a channel may need that is not the notification itself (an email
	// address, a source).
	Metadata map[string]any
}
