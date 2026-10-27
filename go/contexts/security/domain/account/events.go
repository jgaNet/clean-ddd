package account

import (
	"time"

	"clean-ddd/architecture/domain"
	kernel "clean-ddd/sharedkernel/domain"
)

// Domain events are the facts raised by the Account aggregate. They stay inside the Security
// context; the application handlers translate the ones other contexts care about into
// integration events (see application/events).

type AccountCreatedEvent struct {
	domain.DomainEvent
	AccountID string
	Email     string
	Role      kernel.Role
	Status    Status
}

type AccountValidatedEvent struct {
	domain.DomainEvent
	AccountID string
	Email     string
}

type AccountAuthenticatedEvent struct {
	domain.DomainEvent
	AccountID string
	At        time.Time
}
