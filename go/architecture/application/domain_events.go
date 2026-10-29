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
// once they are. Command handlers call it after saving; application services do too. Outside
// any transaction (a reaction, after the command that set it off committed) the step runs at
// once and the context relays at once (see ExecutionContext.BeforeCommit).
//
// A context without a unit of work (a handler's unit test) has no outbox: there the events go
// straight to the bus once the use case has succeeded, as AfterCommit promises.
func PublishDomainEvents(aggregate Recorder, context *ExecutionContext) {
	outbox := context.outbox()
	if outbox == nil {
		context.AfterCommit(func() {
			for _, event := range aggregate.PullDomainEvents() {
				context.Publish(event)
			}
		})
		return
	}
	context.BeforeCommit(func() {
		outbox.Append(aggregate.PullDomainEvents())
	})
}
