import { EventEmitter } from 'events';
import { afterEach, expect, jest } from '@jest/globals';

import { DomainEvent, IntegrationEvent, IResult, Result } from '@Architecture/Domain';
import {
  EventHandler,
  ExecutionContext,
  IOperation,
  publishIntegrationEvent,
  relayOutbox,
} from '@Architecture/Application';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';
import { ConsoleLogger } from '@Architecture/Infrastructure/Logging/ConsoleLogger';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';
import { FastifyApplication } from './FastifyApplication';

class NoteArchived extends DomainEvent<{ noteId: string }> {}
class ArchivingTold extends IntegrationEvent<{ noteId: string }> {}

/** A reaction that tells other contexts, as a domain event handler does (ADR 30). */
class TellTheArchiving extends EventHandler<NoteArchived> {
  async execute({ payload }: NoteArchived, context: ExecutionContext): Promise<IResult> {
    await Promise.resolve();
    publishIntegrationEvent(ArchivingTold.set({ noteId: payload.noteId }), context);
    return Result.ok();
  }
}

const eventually = async (done: () => boolean) => {
  for (let attempt = 0; attempt < 100 && !done(); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
};

/**
 * The relay at start delivers what a previous run made durable and did not publish (ADR 24). It
 * runs in a context the transport builds as it builds a request's, with a unit of work of its
 * own: a reaction it delivers runs in a transaction, and what the reaction tells is made durable
 * and relayed under the outbox entry's id, which the bus recognises if the fact comes again.
 */
describe('the relay at start', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('delivers in a context with a unit of work: what a reaction tells goes through the outbox', async () => {
    const eventEmitter = new EventEmitter();
    const app = new FastifyApplication({ logger: new ConsoleLogger({ debug: false }), apiPrefix: 'v1' }).setEventBus(
      new InMemoryEventBus({ eventEmitter }),
    );
    await app.getEventBus().subscribe(NoteArchived.name, new TellTheArchiving());
    const told: string[] = [];
    eventEmitter.on(ArchivingTold.name, (operation: IOperation<ArchivingTold>) => told.push(operation.id));
    const appended = jest.spyOn(InMemoryOutbox.shared, 'append');

    // What a run that died after its commit left pending.
    InMemoryOutbox.shared.append([NoteArchived.set({ noteId: 'n-1' })]);
    relayOutbox(InMemoryOutbox.shared, app.getEventBus(), app.executionContext('startup'));
    await eventually(() => told.length > 0);

    const durable = appended.mock.results.flatMap(each => each.value as { id: string }[]).map(entry => entry.id);
    expect(told).toHaveLength(1);
    expect(durable).toContain(told[0]);
    expect(InMemoryOutbox.shared.pending()).toEqual([]);
  });
});
