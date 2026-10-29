import { AggregateRoot } from '@Architecture/Domain';
import { EventBus } from '@Architecture/Application/EventBus';
import { ExecutionContext } from '@Architecture/Application/ExecutionContext';

/**
 * Makes every domain event an aggregate recorded durable with the state it describes, and lets
 * the context publish it after the commit (ADR 3, ADR 24). The events are pulled from the
 * aggregate at commit time, not before: what is stored is everything the aggregate recorded
 * during the transaction, and a rollback leaves the aggregate's events where they are,
 * unpublished, to be discarded with it. Extracting and storing the events are one step, taken
 * only when the facts are about to be durable; publishing them is the relay's, once they are.
 *
 * Command handlers call it through `this.publishDomainEvents()`; application services call it
 * directly. A context without a unit of work (a handler's unit spec) has no outbox: there the
 * events go straight to the bus once the use case has succeeded, as `afterCommit` promises.
 */
export function publishDomainEvents(aggregate: AggregateRoot, context: ExecutionContext): void {
  const outbox = context.unitOfWork?.outbox;
  if (!outbox) {
    context.afterCommit(() => {
      for (const event of aggregate.pullDomainEvents()) {
        context.eventBus.publish(event, context);
      }
    });
    return;
  }
  context.beforeCommit(() => {
    outbox.append(aggregate.pullDomainEvents());
  });
}

export type { EventBus };
