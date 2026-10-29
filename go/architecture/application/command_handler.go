package application

import (
	"fmt"

	"clean-ddd/architecture/domain"
)

// CommandHandler is the shape of every use case that changes state (the "C" of CQRS): a
// concrete handler writes Execute — load an aggregate, call a behaviour on it, save it, publish
// its events — and answers with R (an id, a suggestion; Nothing when there is nothing to say).
// Everything else that every command needs is done once, in Run:
//
//  1. Guard        authorization: may this caller run this command at all? (Guarded, optional)
//  2. logging      what ran, and whether it failed
//  3. transaction  Execute runs inside the context's unit of work when there is one
//  4. safety net   an unexpected panic becomes a failed result instead of a crash
//  5. retry        a concurrency conflict is re-read and re-decided in a new transaction, up to
//     ConflictAttempts times; the last conflict is the refusal (ADR 25)
//
// Command subscribes the handler to its command on the event bus, where Handle receives an
// Operation (the command plus its execution context) and marks it done. Run is the typed half
// of the same template, for the rare command a caller runs synchronously instead of publishing
// (a login, whose token must not travel through the bus).
//
// Example: contexts/notes/application/commands/edit_note.go
type CommandHandler[C domain.Event, R any] interface {
	Execute(command C, context *ExecutionContext) (R, error)
}

// Guarded is the authorization hook a handler implements to refuse callers who may not run
// it at all. Business rules about *what* they may do to *which* object belong in the aggregate.
type Guarded interface {
	Guard(context *ExecutionContext) error
}

// Nothing is what a command that has nothing to answer returns; the operation records no result.
type Nothing struct{}

// ConflictAttempts is how many times Execute runs on a concurrency conflict before the conflict is the answer.
const ConflictAttempts = 3

// Run is guard, log, transaction, safety net, retry; the use case's answer in return.
func Run[C domain.Event, R any](handler CommandHandler[C, R], command C, context *ExecutionContext) (R, error) {
	var zero R
	name := domain.NameOf(command)
	if guarded, ok := any(handler).(Guarded); ok {
		if err := guarded.Guard(context); err != nil {
			context.Log().Warn(fmt.Sprintf("%s refused: %s", name, err.Error()), Meta{"traceId": context.TraceID()})
			return zero, err
		}
	}
	context.Log().Info(fmt.Sprintf("Executing %s", name), Meta{"traceId": context.TraceID()})

	value, err := executeUntilUncontended(handler, command, context)
	if err != nil {
		context.Log().Warn(fmt.Sprintf("%s failed: %s", name, err.Error()), Meta{"traceId": context.TraceID()})
	}
	return value, err
}

// executeUntilUncontended is the use case in its transaction; again, from a fresh read, when
// the first run lost a race (ADR 25). Execute loads the aggregate, so the second run re-decides
// the rule on what the other writer left; nothing is re-applied blindly. A failed attempt
// rolled back and dropped its events, like any refusal.
func executeUntilUncontended[C domain.Event, R any](handler CommandHandler[C, R], command C, context *ExecutionContext) (R, error) {
	for attempt := 1; ; attempt++ {
		value, err := Transaction(context, func() (R, error) {
			return safeExecute(handler, command, context)
		})
		if !domain.IsConcurrencyConflict(err) || attempt >= ConflictAttempts {
			return value, err
		}
		context.Log().Info(fmt.Sprintf("%s lost a race (attempt %d of %d); reading again", domain.NameOf(command), attempt, ConflictAttempts),
			Meta{"traceId": context.TraceID()})
	}
}

func safeExecute[C domain.Event, R any](handler CommandHandler[C, R], command C, context *ExecutionContext) (value R, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = domain.Recovered(recovered)
			context.Log().Error(fmt.Sprintf("Unexpected error in %s", domain.NameOf(command)), err, Meta{"traceId": context.TraceID()})
			err = domain.Unknown(err.Error(), nil)
		}
	}()
	return handler.Execute(command, context)
}

// Command subscribes a handler to its command: the subscription lists it under the command's
// name, and the Subscriber it carries runs the template and marks the operation.
func Command[C domain.Event, R any](handler CommandHandler[C, R]) Subscription {
	return Subscription{Channel: domain.NameOfType[C](), Handlers: []Subscriber{command[C, R]{handler}}}
}

type command[C domain.Event, R any] struct {
	handler CommandHandler[C, R]
}

func (c command[C, R]) Handle(operation *Operation) {
	cmd, ok := operation.Event.(C)
	if !ok {
		operation.Failed(domain.Unknown(fmt.Sprintf("%s is not a %s", domain.NameOf(operation.Event), domain.NameOfType[C]()), nil))
		return
	}
	value, err := Run(c.handler, cmd, operation.Context)
	if err != nil {
		operation.Failed(domain.AsException(err))
		return
	}
	var result any = value
	if _, nothing := any(value).(Nothing); nothing {
		result = nil
	}
	operation.Succeeded(result)
}

func (c command[C, R]) Inner() any { return c.handler }
