import { AggregateRoot } from '@SharedKernel/Domain';
import { EventBus } from '@SharedKernel/Application/EventBus';
import { ExecutionContext } from '@SharedKernel/Application/ExecutionContext';

/**
 * Sends every domain event an aggregate recorded, once the surrounding transaction has
 * committed. The events are pulled from the aggregate at that moment, not before: what goes
 * out is everything the aggregate recorded during the transaction, and a rollback leaves the
 * aggregate's events where they are, unpublished, to be discarded with it. Extracting and
 * acknowledging the events are one step, taken only when the facts are durable.
 *
 * Command handlers call it through `this.publishDomainEvents()`; application services call it
 * directly. Outside any transaction the callback runs at once (see ExecutionContext.afterCommit).
 */
export function publishDomainEvents(aggregate: AggregateRoot, context: ExecutionContext): void {
  context.afterCommit(() => {
    for (const event of aggregate.pullDomainEvents()) {
      context.eventBus.publish(event, context);
    }
  });
}

export type { EventBus };
