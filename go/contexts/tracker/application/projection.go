package application

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
)

// ToRecord is the projection itself: from what the bus knows about an operation to what a
// client may see. It keeps the trace and the caller, drops the execution context (logger, bus,
// unit of work have no place in a read model) and the payload (it may carry a secret), and
// flattens the outcome into Result / Error.
func ToRecord(operation *application.Operation) Record {
	record := Record{
		ID:         operation.ID,
		Name:       domain.PublicNameOf(operation.Event),
		Status:     operation.Status,
		TraceID:    operation.Context.TraceID(),
		SubjectID:  operation.Context.Auth().SubjectID,
		Result:     operation.Result,
		CreatedAt:  operation.CreatedAt,
		FinishedAt: operation.FinishedAt,
	}
	if operation.Error != nil {
		record.Error = &OperationError{Type: operation.Error.Type, Message: operation.Error.Message}
	}
	return record
}
