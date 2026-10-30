package application

import (
	"fmt"

	"clean-ddd/architecture/domain"
)

// EventHandler reacts to an event. It is the shape of every listener in the application layer.
//
// A domain event handler stays inside its context and typically logs, updates a read model or
// publishes an integration event for other contexts (contexts/notes/application/events). An
// integration event handler lives in the receiving context and translates the foreign event
// into a local command or service call.
//
// A reaction's outcome is recorded on the operation (SENT, or ERROR with the failure), so a
// listener that fails is visible in the trace instead of vanishing. It cannot undo the fact it
// reacted to: the event was published after the commit (ADR 3), and a failed reaction is the
// listener's problem to retry or report, never the publisher's.
//
// A reaction runs in a transaction of its own (ADR 30), opened by Reaction's subscriber, in a
// context of its own (ExecutionContext.ForReaction): what it saves, and the facts it records or
// publishes, commit together or not at all, and go out through the outbox after the commit,
// like a command's. So Execute saves, calls PublishDomainEvents for an aggregate it changed and
// PublishIntegrationEvent for a fact it tells other contexts, and returns an error to undo all
// of it. It is not made idempotent by hand: all or nothing, one id per fact, and the bus's inbox
// hand a fact to a reaction once.
type EventHandler[E domain.Event] interface {
	Execute(event E, context *ExecutionContext) error
}

// Reaction subscribes a handler to its event: the subscription lists it under the event's name,
// and the Subscriber it carries does what every reaction needs once — its own context and
// transaction, the safety net, the log, the mark on the operation.
func Reaction[E domain.Event](handler EventHandler[E]) Subscription {
	return Subscription{Channel: domain.NameOfType[E](), Handlers: []Subscriber{reaction[E]{handler}}}
}

type reaction[E domain.Event] struct {
	handler EventHandler[E]
}

func (r reaction[E]) Handle(operation *Operation) {
	event, ok := operation.Event.(E)
	if !ok {
		operation.Failed(domain.Unknown(fmt.Sprintf("%s is not a %s", domain.NameOf(operation.Event), domain.NameOfType[E]()), nil))
		return
	}
	context := operation.Context.ForReaction()
	name, channel := handlerName(r.handler), domain.NameOf(event)
	_, err := Transaction(context, func() (Nothing, error) {
		return Nothing{}, safely(func() error { return r.handler.Execute(event, context) })
	})
	if err != nil {
		if _, refused := domain.Refusal(err); refused {
			context.Log().Warn(fmt.Sprintf("%s failed on %s: %s", name, channel, err.Error()), Meta{"traceId": context.TraceID()})
		} else {
			context.Log().Error(fmt.Sprintf("Unexpected error in %s on %s", name, channel), err, Meta{"traceId": context.TraceID()})
		}
		operation.Failed(domain.AsException(err))
		return
	}
	operation.Sent()
}

func (r reaction[E]) Inner() any { return r.handler }

// safely runs fn and turns a panic into an error: the safety net of every base handler.
func safely(fn func() error) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = domain.Recovered(recovered)
		}
	}()
	return fn()
}

func handlerName(handler any) string {
	return fmt.Sprintf("%T", handler)
}
