package account

import (
	"time"

	kernel "clean-ddd/sharedkernel/domain"
)

// Snapshot is the plain data the aggregate is persisted as and rebuilt from. The aggregate
// (account.go) owns the behaviour and the rules; these types own nothing. The snapshot is the
// only shape that crosses the domain boundary towards the infrastructure.

type CredentialsSnapshot struct {
	Type string
	Hash string
}

type Snapshot struct {
	ID                  string
	Email               string
	Role                kernel.Role
	Credentials         CredentialsSnapshot
	Status              Status
	LastAuthenticatedAt *time.Time
	// Version is the one this snapshot was read at; the repository stores version + 1 (ADR 8).
	Version int
}

// NewAccount is what is needed to register a brand new account.
type NewAccount struct {
	Email        string
	Role         kernel.Role
	PasswordHash string
	// Activated: an administrator's account is usable at once; a self-registered one awaits validation.
	Activated bool
}
