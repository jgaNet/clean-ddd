package account

import (
	"fmt"
	"time"

	"clean-ddd/architecture/domain"
	kernel "clean-ddd/sharedkernel/domain"
)

// Account is the aggregate root of the Security context: who can sign in, and as what.
//
//   - an account always has a valid email and a set of credentials (value objects)
//   - it is PENDING until validated, and only an ACTIVE account can authenticate
//   - the email must be unique across accounts: that rule spans the whole collection, so it
//     lives in the Registration domain service, not here
//
// Checking a password against the stored hash is not business: the application layer asks the
// PasswordHasher port, then calls Authenticate to record the fact. The only ways in are
// Register and FromSnapshot; the state stays in unexported fields.
type Account struct {
	domain.AggregateRoot
	email               kernel.Email
	role                kernel.Role
	credentials         Credentials
	status              Status
	lastAuthenticatedAt *time.Time
}

// Register opens a brand new account. Uniqueness of the email is checked by Registration. The
// aggregate picks its own identity, so no persistence round-trip is needed first.
func Register(props NewAccount) (*Account, error) {
	email, err := kernel.NewEmail(props.Email)
	if err != nil {
		return nil, err
	}
	credentials, err := NewCredentials(props.PasswordHash)
	if err != nil {
		return nil, err
	}
	id := domain.GenerateID()
	status := StatusPending
	if props.Activated {
		status = StatusActive
	}
	account := &Account{
		AggregateRoot: domain.NewAggregateRoot(id, 0),
		email:         email,
		role:          props.Role,
		credentials:   credentials,
		status:        status,
	}
	account.Record(AccountCreatedEvent{AccountID: id.Value(), Email: email.Value(), Role: props.Role, Status: status})
	return account, nil
}

// FromSnapshot rebuilds an Account from what was persisted. No event is recorded: nothing new
// happened. Persisted data has already been validated, so an invalid snapshot is a programming
// error and panics instead of returning an error (ADR 4).
func FromSnapshot(snapshot Snapshot) *Account {
	email, err := kernel.NewEmail(snapshot.Email)
	if err != nil {
		panic(fmt.Sprintf("corrupted account %s: %s", snapshot.ID, err.Error()))
	}
	credentials, err := NewCredentials(snapshot.Credentials.Hash)
	if err != nil {
		panic(fmt.Sprintf("corrupted account %s: %s", snapshot.ID, err.Error()))
	}
	if _, known := ParseStatus(string(snapshot.Status)); !known {
		panic(fmt.Sprintf("corrupted account %s: unknown status %q", snapshot.ID, snapshot.Status))
	}
	var lastAuthenticatedAt *time.Time
	if snapshot.LastAuthenticatedAt != nil {
		at := *snapshot.LastAuthenticatedAt
		lastAuthenticatedAt = &at
	}
	return &Account{
		AggregateRoot:       domain.NewAggregateRoot(domain.NewID(snapshot.ID), snapshot.Version),
		email:               email,
		role:                snapshot.Role,
		credentials:         credentials,
		status:              snapshot.Status,
		lastAuthenticatedAt: lastAuthenticatedAt,
	}
}

// Validate confirms the email address: the account becomes usable.
func (a *Account) Validate() error {
	if a.status == StatusActive {
		return AccountAlreadyActive(a.ID().Value())
	}
	a.status = StatusActive
	a.Record(AccountValidatedEvent{AccountID: a.ID().Value(), Email: a.email.Value()})
	return nil
}

// Authenticate records a successful sign-in. The caller has already verified the credentials.
// Time is a parameter with a default: a zero `at` means now.
func (a *Account) Authenticate(at time.Time) error {
	if a.status != StatusActive {
		return InactiveAccount(a.ID().Value())
	}
	if at.IsZero() {
		at = time.Now().UTC()
	}
	a.lastAuthenticatedAt = &at
	a.Record(AccountAuthenticatedEvent{AccountID: a.ID().Value(), At: at})
	return nil
}

// ToSnapshot is the plain data to persist. FromSnapshot(a.ToSnapshot()) gives back an equal account.
func (a *Account) ToSnapshot() Snapshot {
	var lastAuthenticatedAt *time.Time
	if a.lastAuthenticatedAt != nil {
		at := *a.lastAuthenticatedAt
		lastAuthenticatedAt = &at
	}
	return Snapshot{
		ID:                  a.ID().Value(),
		Email:               a.email.Value(),
		Role:                a.role,
		Credentials:         CredentialsSnapshot{Type: a.credentials.Type(), Hash: a.credentials.Hash()},
		Status:              a.status,
		LastAuthenticatedAt: lastAuthenticatedAt,
		Version:             a.Version(),
	}
}

func (a *Account) Email() kernel.Email      { return a.email }
func (a *Account) Role() kernel.Role        { return a.role }
func (a *Account) Credentials() Credentials { return a.credentials }
func (a *Account) Status() Status           { return a.status }

// LastAuthenticatedAt is nil for an account that never signed in.
func (a *Account) LastAuthenticatedAt() *time.Time {
	if a.lastAuthenticatedAt == nil {
		return nil
	}
	at := *a.lastAuthenticatedAt
	return &at
}
