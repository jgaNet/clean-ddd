package application

import "clean-ddd/architecture/domain"

// Recorder is what an aggregate root is to this function: a source of recorded facts.
type Recorder interface {
	PullDomainEvents() []domain.Event
}

// PublishDomainEvents sends every domain event an aggregate recorded, once the surrounding
// transaction has committed. The events are pulled from the aggregate at that moment, not
// before: what goes out is everything the aggregate recorded during the transaction, and a
// rollback leaves the aggregate's events where they are, unpublished, to be discarded with it.
// Extracting and acknowledging the events are one step, taken only when the facts are durable
// (ADR 3). Command handlers call it after saving; application services do too. Outside any
// transaction the callback runs at once (see ExecutionContext.AfterCommit).
func PublishDomainEvents(aggregate Recorder, context *ExecutionContext) {
	context.AfterCommit(func() {
		for _, event := range aggregate.PullDomainEvents() {
			context.Publish(event)
		}
	})
}
