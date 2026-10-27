package note

// Repository is the write side of persistence. It speaks in aggregates: it gives you a Note
// back, and it takes a Note in. How and where it is stored is not the domain's concern; the
// infrastructure layer provides an implementation.
//
// It deliberately has no "search" method (listing and filtering belong to Queries) and no
// "next identity" method (the aggregate generates its own id in Create).
type Repository interface {
	// FindByID answers nil, nil when there is no such note; an error is the store's failure.
	FindByID(id string) (*Note, error)
	// Save stores the aggregate at version + 1, or refuses it with a ConcurrencyConflict when
	// the stored version is no longer the one it was loaded with: of two writers who read the
	// same version, only the first wins (ADR 8). The contract test asserts it for every adapter.
	Save(note *Note) error
}
