package commands

import (
	"time"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/security/domain/account"
	"clean-ddd/contexts/security/domain/auth"
)

// Login answers synchronously (the caller needs the token), so the route runs the handler
// through the module (application.Run) instead of publishing the command on the bus: the
// token is answered, and the Tracker never sees it.

type LoginCommandEvent struct {
	domain.CommandEvent
	// Identifier is the account's email; the field is named for what a login form calls it.
	Identifier string
	Password   string
}

// LoginResult is the session token, for an active account with the right password.
type LoginResult struct {
	Token string
}

type LoginHandler struct {
	accounts account.Repository
	hasher   auth.PasswordHasher
	tokens   auth.SignedTokens
}

func NewLoginHandler(accounts account.Repository, hasher auth.PasswordHasher, tokens auth.SignedTokens) *LoginHandler {
	return &LoginHandler{accounts: accounts, hasher: hasher, tokens: tokens}
}

func (h *LoginHandler) Execute(command LoginCommandEvent, ctx *application.ExecutionContext) (LoginResult, error) {
	a, err := h.accounts.FindByEmail(command.Identifier)
	if err != nil {
		return LoginResult{}, err
	}
	if a == nil {
		return LoginResult{}, account.InvalidCredentials()
	}
	matches, err := h.hasher.Compare(command.Password, a.Credentials().Hash())
	if err != nil {
		return LoginResult{}, err
	}
	if !matches {
		return LoginResult{}, account.InvalidCredentials()
	}
	if err := a.Authenticate(time.Time{}); err != nil {
		return LoginResult{}, err
	}
	if err := h.accounts.Save(a); err != nil {
		return LoginResult{}, err
	}
	application.PublishDomainEvents(a, ctx)

	token, err := h.tokens.Sign(auth.Claims{SubjectID: a.ID().Value(), SubjectType: string(a.Role())})
	if err != nil {
		return LoginResult{}, err
	}
	return LoginResult{Token: token}, nil
}
