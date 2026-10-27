package queries

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/security/domain/account"
	kernel "clean-ddd/sharedkernel/application"
	kerneldomain "clean-ddd/sharedkernel/domain"
)

// GetAccount: a user may read their own account; an administrator may read any. The rule
// depends on the parameter (whose account), so it sits in Execute and not in a Guard.
type GetAccountHandler struct {
	queries account.Queries
}

func NewGetAccountHandler(queries account.Queries) *GetAccountHandler {
	return &GetAccountHandler{queries: queries}
}

func (h *GetAccountHandler) Execute(accountID string, ctx *application.ExecutionContext) (account.Detail, error) {
	me, err := kernel.RequireSignedIn(ctx, account.Service)
	if err != nil {
		return account.Detail{}, err
	}
	if role, _ := kerneldomain.ParseRole(ctx.Auth().Role); role == kerneldomain.RoleUser && me.Value() != accountID {
		return account.Detail{}, domain.NotAllowed(account.Service, "Not Allowed", nil)
	}
	detail, err := h.queries.FindByID(accountID)
	if err != nil {
		return account.Detail{}, err
	}
	if detail == nil {
		return account.Detail{}, domain.NotFound(account.Service, "Account not found", nil)
	}
	return *detail, nil
}
