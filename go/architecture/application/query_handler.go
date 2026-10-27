package application

import (
	"fmt"

	"clean-ddd/architecture/domain"
)

// QueryHandler is the shape of every read use case (the "Q" of CQRS). A query never changes
// state: it asks a queries port for a read model (R) from its parameters (P) and returns it.
// Because it does not go through aggregates, the read side can be shaped for the screen,
// denormalized, cached or served from a different store than the write side (ADR 5).
//
// Query mirrors Run for commands: it is what a route calls, and does the guard, the logging and
// the safety net once; a concrete handler only writes Execute. There is no transaction and no
// operation: a query answers synchronously and is never put on the bus. A handler with no
// parameters takes NoParams.
//
// Example: contexts/notes/application/queries/get_note.go
type QueryHandler[P any, R any] interface {
	Execute(params P, context *ExecutionContext) (R, error)
}

// NoParams is the parameter type of a query that takes none.
type NoParams struct{}

// Query is log, guard, safety net; the read model in return.
func Query[P any, R any](handler QueryHandler[P, R], params P, context *ExecutionContext) (R, error) {
	var zero R
	name := handlerName(handler)
	context.Log().Debug(fmt.Sprintf("Executing %s", name), Meta{"traceId": context.TraceID()})
	if guarded, ok := any(handler).(Guarded); ok {
		if err := guarded.Guard(context); err != nil {
			context.Log().Warn(fmt.Sprintf("%s refused: %s", name, err.Error()), Meta{"traceId": context.TraceID()})
			return zero, err
		}
	}
	value, err := safeQuery(handler, params, context)
	if err != nil {
		context.Log().Warn(fmt.Sprintf("%s failed: %s", name, err.Error()), Meta{"traceId": context.TraceID()})
	}
	return value, err
}

func safeQuery[P any, R any](handler QueryHandler[P, R], params P, context *ExecutionContext) (value R, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = domain.Recovered(recovered)
			context.Log().Error(fmt.Sprintf("Unexpected error in %s", handlerName(handler)), err, Meta{"traceId": context.TraceID()})
			err = domain.Unknown(err.Error(), nil)
		}
	}()
	return handler.Execute(params, context)
}
