import { EventEmitter } from 'events';
import { expect, jest } from '@jest/globals';

import { DomainEvent, IntegrationEvent, IResult, NotFoundException, Result } from '@Architecture/Domain';
import { publishIntegrationEvent } from './DomainEvents';
import { EventBus } from './EventBus';
import { EventHandler } from './EventHandler';
import { ExecutionContext } from './ExecutionContext';
import { OperationStatus } from './Operation';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';
import { InMemoryUnitOfWork } from '@Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork';

class Greeted extends DomainEvent<{ then?: 'fail' | 'throw' }> {}

class OnGreeted extends EventHandler<Greeted> {
  reacted = false;

  async execute({ payload }: Greeted): Promise<IResult> {
    await Promise.resolve(); // a real reaction is asynchronous
    if (payload.then === 'throw') throw new Error('boom');
    if (payload.then === 'fail') return Result.fail(new NotFoundException('Test', 'Nothing to react to'));
    this.reacted = true;
    return Result.ok();
  }
}

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const operationFor = (payload: Greeted['payload']) =>
  new InMemoryEventBus({ eventEmitter: new EventEmitter() }).publish(
    Greeted.set(payload),
    new ExecutionContext({ traceId: 'trace', eventBus, auth: {} }),
  );

describe('EventHandler.handle()', () => {
  it('awaits the reaction and marks the operation SENT', async () => {
    const handler = new OnGreeted();

    const done = await handler.handle(operationFor({}));

    expect(handler.reacted).toBe(true); // not fire-and-forget: the reaction ran before handle() resolved
    expect(done.status).toBe(OperationStatus.SENT);
  });

  it('records a failed reaction on the operation', async () => {
    const done = await new OnGreeted().handle(operationFor({ then: 'fail' }));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.message).toBe('Nothing to react to');
  });

  it('turns a throw into a failed operation instead of an unhandled rejection', async () => {
    const done = await new OnGreeted().handle(operationFor({ then: 'throw' }));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(done.result?.error?.message).toBe('boom');
  });
});

/**
 * A reaction's transaction is its own (ADR 30): what it saves and what it tells other contexts
 * commit together, or neither does.
 */
class Told extends IntegrationEvent<{ who: string }> {}

class OnGreetedSaveAndTell extends EventHandler<Greeted> {
  constructor(private store: InMemoryDataSource<string>) {
    super();
  }

  async execute({ payload }: Greeted, context: ExecutionContext): Promise<IResult> {
    await Promise.resolve();
    for (const who of ['ann', 'bob']) {
      this.store.collection.set(who, 'told');
      publishIntegrationEvent(Told.set({ who }), context);
      if (payload.then === 'fail' && who === 'bob') return Result.fail(new NotFoundException('Test', 'bob is gone'));
    }
    return Result.ok();
  }
}

describe('a reaction', () => {
  const setup = () => {
    const store = new InMemoryDataSource<string>();
    const outbox = new InMemoryOutbox();
    const unitOfWork = new InMemoryUnitOfWork([store, outbox.store], outbox);
    const published = jest.fn();
    const bus = { connect: jest.fn(), publish: published, subscribe: jest.fn() } as unknown as EventBus;
    const operation = (payload: Greeted['payload']) =>
      new InMemoryEventBus({ eventEmitter: new EventEmitter() }).publish(
        Greeted.set(payload),
        new ExecutionContext({ traceId: 'trace', eventBus: bus, auth: {}, unitOfWork }),
      );
    return { store, outbox, unitOfWork, published, operation };
  };

  it('commits what it saved and tells other contexts after the commit, through the outbox, under the entry ids', async () => {
    const { store, outbox, published, operation } = setup();

    const done = await new OnGreetedSaveAndTell(store).handle(operation({}));

    expect(done.status).toBe(OperationStatus.SENT);
    expect([...store.collection.keys()]).toEqual(['ann', 'bob']);
    expect(published.mock.calls.map(([event, , id]) => [(event as Told).payload.who, typeof id])).toEqual([
      ['ann', 'string'],
      ['bob', 'string'],
    ]);
    expect(outbox.pending()).toEqual([]);
  });

  it('undoes all of it when it fails half-way: nothing saved, nothing told, so a second delivery starts clean', async () => {
    const { store, outbox, published, operation } = setup();

    const done = await new OnGreetedSaveAndTell(store).handle(operation({ then: 'fail' }));

    expect(done.status).toBe(OperationStatus.ERROR);
    expect(store.collection.size).toBe(0);
    expect(published).not.toHaveBeenCalled();
    expect(outbox.pending()).toEqual([]);
  });

  it('runs beside another reaction to the same fact, and beside the open transaction that published it', async () => {
    const { store, unitOfWork, operation } = setup();
    const fact = operation({});
    await unitOfWork.beginTransaction(); // the publisher's, still open while it relays

    const [first, second] = await Promise.all([
      new OnGreetedSaveAndTell(store).handle(fact),
      new OnGreetedSaveAndTell(store).handle(fact),
    ]);

    expect([first.status, second.status]).toEqual([OperationStatus.SENT, OperationStatus.SENT]);
  });
});
