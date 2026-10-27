package queries

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	trackerapp "clean-ddd/contexts/tracker/application"
	kerneldomain "clean-ddd/sharedkernel/domain"
)

// GetOperationsParams narrows the listing to one trace when TraceID is given.
type GetOperationsParams struct {
	TraceID string
}

// GetOperationsHandler lists every operation, or those of one trace: an administrator's view.
type GetOperationsHandler struct {
	records trackerapp.Records
}

func NewGetOperationsHandler(records trackerapp.Records) *GetOperationsHandler {
	return &GetOperationsHandler{records: records}
}

// Guard refuses anyone but an administrator, an anonymous caller included: the rule needs no
// caller id, so it is a guard and not a RequireSignedIn in Execute.
func (h *GetOperationsHandler) Guard(ctx *application.ExecutionContext) error {
	if role, _ := kerneldomain.ParseRole(ctx.Auth().Role); role != kerneldomain.RoleAdmin {
		return domain.NotAllowed(trackerapp.Service, "Only an administrator can list operations", nil)
	}
	return nil
}

func (h *GetOperationsHandler) Execute(params GetOperationsParams, _ *application.ExecutionContext) ([]trackerapp.Record, error) {
	if params.TraceID != "" {
		return h.records.FindByTrace(params.TraceID)
	}
	return h.records.FindAll()
}
