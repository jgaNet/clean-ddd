package events

import (
	"fmt"

	"clean-ddd/architecture/application"
	"clean-ddd/contexts/security/domain/account"
	"clean-ddd/contexts/security/domain/auth"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// AccountCreatedHandler translates the domain fact into what other contexts need: a validation
// token the Notifications context will email to the new account. An account opened active (by
// an administrator, or the seed) has nothing to validate, so nothing leaves the context.
type AccountCreatedHandler struct {
	tokens auth.SignedTokens
}

func NewAccountCreatedHandler(tokens auth.SignedTokens) *AccountCreatedHandler {
	return &AccountCreatedHandler{tokens: tokens}
}

func (h *AccountCreatedHandler) Execute(event account.AccountCreatedEvent, ctx *application.ExecutionContext) error {
	ctx.Log().Debug(fmt.Sprintf("Account %s created", event.AccountID), application.Meta{"traceId": ctx.TraceID()})
	if event.Status == account.StatusActive {
		return nil
	}
	validationToken, err := h.tokens.Sign(auth.Claims{SubjectID: event.AccountID, SubjectType: auth.TokenTypeValidation})
	if err != nil {
		return err
	}
	ctx.Publish(integrationevents.AccountCreatedIntegrationEvent{
		AccountID:       event.AccountID,
		Email:           event.Email,
		ValidationToken: validationToken,
	})
	return nil
}
