package events

import (
	"fmt"

	"clean-ddd/architecture/application"
	"clean-ddd/contexts/security/domain/account"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// AccountValidatedHandler restates the fact for the other contexts.
type AccountValidatedHandler struct{}

func (AccountValidatedHandler) Execute(event account.AccountValidatedEvent, ctx *application.ExecutionContext) error {
	ctx.Log().Debug(fmt.Sprintf("Account %s validated", event.AccountID), application.Meta{"traceId": ctx.TraceID()})
	application.PublishIntegrationEvent(integrationevents.AccountValidatedIntegrationEvent{AccountID: event.AccountID, Email: event.Email}, ctx)
	return nil
}
