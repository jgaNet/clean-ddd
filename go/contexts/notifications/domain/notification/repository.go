package notification

// Repository is the write side of persistence. It speaks in aggregates: it gives you a
// Notification back, attempts included, and it takes one in. How and where it is stored is not
// the domain's concern; the infrastructure layer provides an implementation.
//
// It has no "search" method (the inbox belongs to Queries) and no "next identity" method (the
// aggregate generates its own id in Create).
type Repository interface {
	// FindByID answers nil, nil when there is no such notification; an error is the store's failure.
	FindByID(id string) (*Notification, error)
	// Save stores the aggregate at version + 1, or refuses it with a ConcurrencyConflict when
	// the stored version is no longer the one it was loaded with (ADR 8).
	Save(notification *Notification) error
}
