import { expect, jest } from '@jest/globals';

import { AggregateRoot, DomainEvent, NotAllowedException, Result } from '@Architecture/Domain';
import { Id } from '@Architecture/Domain';
import { EventBus } from './EventBus';
import { ExecutionContext } from './ExecutionContext';
import { publishDomainEvents } from '@Architecture/Application/DomainEvents';
import { InMemoryOutbox } from '@Architecture/Infrastructure/Outbox/InMemoryOutbox';
import { InMemoryUnitOfWork } from '@Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork';

class Greeted extends DomainEvent<{ name: string }> {}
class Greeter extends AggregateRoot {
  greet(name: string) {
    this.record(Greeted.set({ name }));
  }
}

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const published = () => jest.mocked(eventBus.publish).mock.calls.map(([event]) => event.payload);

let outbox: InMemoryOutbox;
const context = () =>
  new ExecutionContext({
    traceId: 'trace',
    eventBus,
    unitOfWork: new InMemoryUnitOfWork([outbox.store], outbox),
    auth: { subjectId: 'alice', role: 'USER' },
  });

beforeEach(() => {
  jest.resetAllMocks();
  outbox = new InMemoryOutbox();
});

/** ADR 3 and ADR 24: durable with the state at commit, published from the outbox after it, never lost. */
describe('publishDomainEvents', () => {
  it('stores at commit everything the aggregate recorded during the transaction, and publishes it after', async () => {
    const greeter = new Greeter(new Id('g'));
    const ctx = context();

    await ctx.withTransaction(async () => {
      greeter.greet('alice');
      publishDomainEvents(greeter, ctx);
      greeter.greet('bob'); // recorded after the call, still inside the transaction
      expect(outbox.pending()).toEqual([]);
      expect(eventBus.publish).not.toHaveBeenCalled();
      return Result.ok();
    });

    expect(published()).toEqual([{ name: 'alice' }, { name: 'bob' }]);
    expect(greeter.pullDomainEvents()).toEqual([]);
    expect(outbox.pending()).toEqual([]);
  });

  it('publishes each fact with its outbox entry as the message id, so the bus can recognise it', async () => {
    const greeter = new Greeter(new Id('g'));
    const ctx = context();
    const appended: string[] = [];
    const append = jest.spyOn(outbox, 'append');
    append.mockImplementation(events => {
      const entries = InMemoryOutbox.prototype.append.call(outbox, events);
      appended.push(...entries.map(entry => entry.id));
      return entries;
    });

    await ctx.withTransaction(async () => {
      greeter.greet('alice');
      publishDomainEvents(greeter, ctx);
      return Result.ok();
    });

    expect(jest.mocked(eventBus.publish).mock.calls.map(([, , id]) => id)).toEqual(appended);
  });

  it('stores nothing and leaves the events on the aggregate when the transaction rolls back', async () => {
    const greeter = new Greeter(new Id('g'));
    const ctx = context();

    await ctx.withTransaction(async () => {
      greeter.greet('alice');
      publishDomainEvents(greeter, ctx);
      return Result.fail(new NotAllowedException('Test', 'refused'));
    });

    expect(eventBus.publish).not.toHaveBeenCalled();
    expect(outbox.pending()).toEqual([]);
    expect(greeter.pullDomainEvents()).toHaveLength(1);
  });

  it('keeps a fact the relay could not publish, and the next commit publishes it: the window is closed', async () => {
    const greeter = new Greeter(new Id('g'));
    const ctx = context();
    // What the bus really took: a call that threw took nothing.
    const delivered: unknown[] = [];
    jest.mocked(eventBus.publish).mockImplementation(event => {
      delivered.push(event.payload);
      return undefined as never;
    });
    jest.mocked(eventBus.publish).mockImplementationOnce(() => {
      throw new Error('the bus is down');
    });

    await ctx.withTransaction(async () => {
      greeter.greet('alice');
      publishDomainEvents(greeter, ctx);
      return Result.ok();
    });
    expect(delivered).toEqual([]);
    expect(outbox.pending().map(entry => entry.event.payload)).toEqual([{ name: 'alice' }]);

    const other = new Greeter(new Id('h'));
    await ctx.withTransaction(async () => {
      other.greet('bob');
      publishDomainEvents(other, ctx);
      return Result.ok();
    });
    expect(delivered).toEqual([{ name: 'alice' }, { name: 'bob' }]);
    expect(outbox.pending()).toEqual([]);
  });

  it('stores and publishes at once outside any transaction: a reaction, after the command that set it off committed', () => {
    const greeter = new Greeter(new Id('g'));
    const ctx = context();

    greeter.greet('alice');
    publishDomainEvents(greeter, ctx);

    expect(published()).toEqual([{ name: 'alice' }]);
    expect(outbox.pending()).toEqual([]);
    expect(greeter.pullDomainEvents()).toEqual([]);
  });

  it('goes straight to the bus once the use case has succeeded when there is no unit of work, hence no outbox', async () => {
    const greeter = new Greeter(new Id('g'));
    const ctx = new ExecutionContext({ traceId: 'trace', eventBus, auth: {} });

    await ctx.withTransaction(async () => {
      greeter.greet('alice');
      publishDomainEvents(greeter, ctx);
      expect(eventBus.publish).not.toHaveBeenCalled();
      return Result.ok();
    });

    expect(published()).toEqual([{ name: 'alice' }]);
  });
});
