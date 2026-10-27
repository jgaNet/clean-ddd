package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/security/domain/account"
	"clean-ddd/contexts/security/domain/auth"
	kernel "clean-ddd/sharedkernel/domain"
)

// ValidateAccount: who may validate an account is an administrator, for any account, or
// whoever holds the validation token that was emailed for it. The token is verified here, not
// in the route, so that the rule cannot be bypassed by publishing the command another way.
// Two ways to ask, one command: nothing in the payload is taken as proof of anything. The rule
// depends on the command (token or id), which is why it sits in Execute and not in a Guard.

// ValidateAccountCommandEvent is by token (anyone holding it) or by account id (administrators only); one of the two.
type ValidateAccountCommandEvent struct {
	domain.CommandEvent
	ValidationToken string
	AccountID       string
}

type ValidateAccountHandler struct {
	accounts account.Repository
	tokens   auth.SignedTokens
}

func NewValidateAccountHandler(accounts account.Repository, tokens auth.SignedTokens) *ValidateAccountHandler {
	return &ValidateAccountHandler{accounts: accounts, tokens: tokens}
}

// Execute answers with the id of the account it validated.
func (h *ValidateAccountHandler) Execute(command ValidateAccountCommandEvent, ctx *application.ExecutionContext) (string, error) {
	accountID, err := h.accountIDAllowedFor(command, ctx)
	if err != nil {
		return "", err
	}
	a, err := h.accounts.FindByID(accountID)
	if err != nil {
		return "", err
	}
	if a == nil {
		return "", account.AccountNotFound(accountID)
	}
	if err := a.Validate(); err != nil {
		return "", err
	}
	if err := h.accounts.Save(a); err != nil {
		return "", err
	}
	application.PublishDomainEvents(a, ctx)
	return a.ID().Value(), nil
}

func (h *ValidateAccountHandler) accountIDAllowedFor(command ValidateAccountCommandEvent, ctx *application.ExecutionContext) (string, error) {
	if command.ValidationToken != "" {
		claims, ok := h.tokens.Verify(command.ValidationToken)
		if !ok || claims.SubjectType != auth.TokenTypeValidation {
			return "", domain.NotAllowed(account.Service, "Invalid validation token", nil)
		}
		return claims.SubjectID, nil
	}
	if role, known := kernel.ParseRole(ctx.Auth().Role); !known || role != kernel.RoleAdmin {
		return "", domain.NotAllowed(account.Service, "Only an administrator can validate an account by id", nil)
	}
	if command.AccountID == "" {
		return "", account.AccountNotFound("")
	}
	return command.AccountID, nil
}
