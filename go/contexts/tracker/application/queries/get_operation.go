package queries

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	trackerapp "clean-ddd/contexts/tracker/application"
	kernel "clean-ddd/sharedkernel/application"
	kerneldomain "clean-ddd/sharedkernel/domain"
)

// GetOperationHandler answers one operation by id: a user may follow their own operations;
// an administrator may follow any.
type GetOperationHandler struct {
	records trackerapp.Records
}

func NewGetOperationHandler(records trackerapp.Records) *GetOperationHandler {
	return &GetOperationHandler{records: records}
}

func (h *GetOperationHandler) Execute(operationID string, ctx *application.ExecutionContext) (trackerapp.Record, error) {
	reader, err := kernel.RequireSignedIn(ctx, trackerapp.Service)
	if err != nil {
		return trackerapp.Record{}, err
	}
	record, err := h.records.FindByID(operationID)
	if err != nil {
		return trackerapp.Record{}, err
	}
	// An operation someone else started does not exist, as far as you know.
	role, _ := kerneldomain.ParseRole(ctx.Auth().Role)
	isAdmin := role == kerneldomain.RoleAdmin
	if record == nil || (!isAdmin && record.SubjectID != reader.Value()) {
		return trackerapp.Record{}, domain.NotFound(trackerapp.Service, "Operation not found", map[string]any{"id": operationID})
	}
	return *record, nil
}
