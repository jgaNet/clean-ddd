package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/security/domain/account"
	"clean-ddd/contexts/security/domain/auth"
	kernel "clean-ddd/sharedkernel/domain"
)

// SignUp is self-registration: anyone may sign up, the account stays PENDING until the email
// is validated (see events.AccountCreatedHandler, which sends the validation token). The
// password travels in clear inside the process only; it is hashed before anything is stored.

type SignUpCommandEvent struct {
	domain.CommandEvent
	Email    string
	Password string
}

type SignUpHandler struct {
	accounts     account.Repository
	registration *account.Registration
	hasher       auth.PasswordHasher
}

func NewSignUpHandler(accounts account.Repository, registration *account.Registration, hasher auth.PasswordHasher) *SignUpHandler {
	return &SignUpHandler{accounts: accounts, registration: registration, hasher: hasher}
}

// Execute answers with the id of the account it opened: the operation's result.
func (h *SignUpHandler) Execute(command SignUpCommandEvent, ctx *application.ExecutionContext) (string, error) {
	hash, err := h.hasher.Hash(command.Password)
	if err != nil {
		return "", err
	}
	a, err := h.registration.Register(account.NewAccount{
		Email:        command.Email,
		Role:         kernel.RoleUser,
		PasswordHash: hash,
		Activated:    false,
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
