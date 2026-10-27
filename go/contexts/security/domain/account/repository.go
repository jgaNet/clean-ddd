package account

// Repository is the write side of persistence: it loads and saves the Account aggregate.
// FindByEmail is here, not in the queries, because the domain itself needs it (Registration)
// and the result is an aggregate, not a read model. It has no "next identity" method: the
// aggregate generates its own id in Register.
type Repository interface {
	// FindByID answers nil, nil when there is no such account; an error is the store's failure.
	FindByID(id string) (*Account, error)
	// FindByEmail answers nil, nil when no account has that email, whatever its case.
	FindByEmail(email string) (*Account, error)
	// Save stores the aggregate at version + 1, or refuses it with a ConcurrencyConflict when
	// the stored version is no longer the one it was loaded with (ADR 8).
	Save(account *Account) error
}
