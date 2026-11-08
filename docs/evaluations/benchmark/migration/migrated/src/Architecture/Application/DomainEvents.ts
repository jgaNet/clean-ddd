import { AggregateRoot, Event, IntegrationEvent } from '@Architecture/Domain';
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
 * Command handlers call it through `await this.publishDomainEvents()`; application services call
 * it directly, and await it: the outbox is a store, and outside a transaction the events are
 * stored and relayed before the promise settles. A context without a unit of work (a handler's unit spec) has no outbox: there the
 * events go straight to the bus once the use case has succeeded, as `afterCommit` promises.
 */
export async function publishDomainEvents(aggregate: AggregateRoot, context: ExecutionContext): Promise<void> {
  await durable(() => aggregate.pullDomainEvents(), context);
}

/**
 * Tells other contexts a fact the way a domain event is told (ADR 30): appended to the outbox
 * when the reaction's transaction commits, relayed after it, under the entry's id. The reaction
 * that translates a domain event into the published contract calls it; nothing publishes an
 * integration event straight to the bus, where a rollback could not take it back.
 */
export async function publishIntegrationEvent(
  event: IntegrationEvent<unknown>,
  context: ExecutionContext,
): Promise<void> {
  await durable(() => [event], context);
}

/** At commit, the events are appended to the outbox; without a unit of work, published once the use case has succeeded. */
async function durable(events: () => Event<unknown>[], context: ExecutionContext): Promise<void> {
  const outbox = context.unitOfWork?.outbox;
  if (!outbox) {
    context.afterCommit(() => {
      for (const event of events()) {
        context.eventBus.publish(event, context);
      }
    });
    return;
  }
  await context.beforeCommit(async () => {
    await outbox.append(events());
  });
}

export type { EventBus };
