package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/security/domain/account"
	"clean-ddd/contexts/security/domain/auth"
	kernel "clean-ddd/sharedkernel/domain"
)

// RegisterAdmin is reserved to administrators (and to the bootstrap, acting as the system).
// The account is usable at once. The rule needs no caller id, so it is a Guard, which only
// application.Run runs: its test goes through a subscription, as the bus would.

type RegisterAdminCommandEvent struct {
	domain.CommandEvent
	Email    string
	Password string
}

type RegisterAdminHandler struct {
	accounts     account.Repository
	registration *account.Registration
	hasher       auth.PasswordHasher
}

func NewRegisterAdminHandler(accounts account.Repository, registration *account.Registration, hasher auth.PasswordHasher) *RegisterAdminHandler {
	return &RegisterAdminHandler{accounts: accounts, registration: registration, hasher: hasher}
}

// Guard: administrators only.
func (h *RegisterAdminHandler) Guard(ctx *application.ExecutionContext) error {
	if role, known := kernel.ParseRole(ctx.Auth().Role); !known || role != kernel.RoleAdmin {
		return domain.NotAllowed(account.Service, "Only an administrator can register another one", nil)
	}
	return nil
}

// Execute answers with the id of the account it opened.
func (h *RegisterAdminHandler) Execute(command RegisterAdminCommandEvent, ctx *application.ExecutionContext) (string, error) {
	hash, err := h.hasher.Hash(command.Password)
	if err != nil {
		return "", err
	}
	a, err := h.registration.Register(account.NewAccount{
		Email:        command.Email,
		Role:         kernel.RoleAdmin,
		PasswordHash: hash,
		Activated:    true,
	})
	if err != nil {
		return "", err
	}
	if err := h.accounts.Save(a); err != nil {
		return "", err
	}
	application.PublishDomainEvents(a, ctx)
	return a.ID().Value(), nil
}
