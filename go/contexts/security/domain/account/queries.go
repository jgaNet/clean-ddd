package account

import (
	"time"

	kernel "clean-ddd/sharedkernel/domain"
)

// Detail is the read model of an account: what a screen or an API may show. Never the
// credentials. Plain data, tailored to a use case; it never comes back into the domain.
type Detail struct {
	ID                  string
	Email               string
	Role                kernel.Role
	Status              Status
	LastAuthenticatedAt *time.Time
}

// Queries is the read side (the "Q" of CQRS): read models, not aggregates (ADR 5).
type Queries interface {
	// FindByID answers nil, nil for an unknown id.
	FindByID(id string) (*Detail, error)
}
