package application

import "clean-ddd/architecture/domain"

// Recorder is what an aggregate root is to this function: a source of recorded facts.
type Recorder interface {
	PullDomainEvents() []domain.Event
}

// PublishDomainEvents makes every domain event an aggregate recorded durable with the state it
// describes, and lets the context publish it after the commit (ADR 3, ADR 24). The events are
// pulled from the aggregate at commit time, not before: what is stored is everything the
// aggregate recorded during the transaction, and a rollback leaves the aggregate's events
// where they are, unpublished, to be discarded with it. Extracting and storing the events are
// one step, taken only when the facts are about to be durable; publishing them is the relay's,
// once they are. Command handlers call it after saving; application services and reactions do
// too, a reaction inside the transaction of its own its base handler opens (ADR 30).
//
// A context without a unit of work (a handler's unit test) has no outbox: there the events go
// straight to the bus once the use case has succeeded, as AfterCommit promises.
func PublishDomainEvents(aggregate Recorder, context *ExecutionContext) {
	durable(aggregate.PullDomainEvents, context)
}

// PublishIntegrationEvent tells other contexts a fact the way a domain event is told (ADR 30):
// appended to the outbox when the reaction's transaction commits, relayed after it, under the
// entry's id. The reaction that translates a domain event into the published contract calls it;
// nothing publishes an integration event straight to the bus, where a rollback could not take
// it back. ctx.Publish is for a route sending a command, never for a reaction.
func PublishIntegrationEvent(event domain.Event, context *ExecutionContext) {
	durable(func() []domain.Event { return []domain.Event{event} }, context)
}

// durable appends the events to the outbox at commit; without a unit of work, publishes them
// once the use case has succeeded.
func durable(events func() []domain.Event, context *ExecutionContext) {
	outbox := context.outbox()
	if outbox == nil {
		context.AfterCommit(func() {
			for _, event := range events() {
				context.Publish(event)
			}
		})
		return
	}
	context.BeforeCommit(func() {
		outbox.Append(events())
	})
}
