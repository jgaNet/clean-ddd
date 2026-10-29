package application

import "clean-ddd/architecture/domain"

// Subscriber is a handler as the bus sees it: it takes an operation and marks it.
type Subscriber interface {
	Handle(operation *Operation)
}

// EventBus publishes events and routes them to the handlers subscribed to their name.
//
// Publish builds an Operation and starts its Dispatch in the background, answering with the
// operation at once: that is how a route answers 202 { operationId } before the handling is
// done (ADR 14), and what the Tracker context records so a client can poll it. Dispatch runs
// the handlers; a test calls the in-memory bus's Settle to see what they did.
//
// Implementations: the in-memory bus of the building blocks' Infrastructure (a process-local
// router) and the Tracker context's decorator that records every operation.
type EventBus interface {
	// Connect reaches the event infrastructure, when there is one.
	Connect() error
	// Publish builds the operation, schedules its dispatch, and answers with it before the handling.
	Publish(event domain.Event, context *ExecutionContext) *Operation
	// PublishWithID is Publish for a message relayed from the outbox: the operation carries the
	// entry's id as its own, so a subscriber that already handled it is not handed it again (ADR 24).
	PublishWithID(event domain.Event, context *ExecutionContext, messageID string) *Operation
	// Dispatch hands the operation to every handler subscribed to its event's name, and waits for them.
	Dispatch(operation *Operation)
	// Subscribe routes the events named channel to handler.
	Subscribe(channel string, handler Subscriber)
}
