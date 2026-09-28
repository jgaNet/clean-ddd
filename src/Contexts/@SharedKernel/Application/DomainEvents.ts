import { AggregateRoot } from '@SharedKernel/Domain';

import { ExecutionContext } from '@SharedKernel/Application/ExecutionContext';

/**
 * Sends every domain event an aggregate recorded. The events are taken from the aggregate
 * now but published only once the surrounding transaction is committed, so listeners never
 * see facts that end up rolled back. Command handlers call it through
 * `this.publishDomainEvents()`; application services call it directly.
 */
export function publishDomainEvents(aggregate: AggregateRoot, context: ExecutionContext): void {
  const events = aggregate.pullDomainEvents();
  context.afterCommit(() => {
    for (const event of events) {
      context.eventBus.publish(event, context);
    }
  });
}
