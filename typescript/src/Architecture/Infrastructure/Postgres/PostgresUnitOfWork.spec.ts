import { EventEmitter } from 'events';

import { DomainEvent } from '@Architecture/Domain';
import { ExecutionContext, relayOutbox } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';
import { FreshDatabase, freshDatabase, TEST_POSTGRES } from './FreshDatabase.spec-helper';
import { PostgresDatabase } from './PostgresDatabase';
import { PostgresUnitOfWork } from './PostgresUnitOfWork';

class Greeted extends DomainEvent<{ name: string }> {}

const settle = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * The unit of work and the outbox over PostgreSQL, held to what the in-memory ones promise and
 * to what a database adds: a transaction of its own per unit of work, an outbox that commits or
 * rolls back with the writes, a lock that serializes the writers of one key. Runs against the
 * server `TEST_POSTGRES` names, on a database of its own that it drops; skipped, and said so,
 * without one (CI starts a server).
 */
(TEST_POSTGRES ? describe : describe.skip)('PostgresUnitOfWork and PostgresOutbox', () => {
  let fresh: FreshDatabase;
  let database: PostgresDatabase;
  beforeAll(async () => {
    fresh = await freshDatabase('architecture');
    database = new PostgresDatabase(fresh.url, { max: 4 });
    await database.ensureSchema();
  });
  afterAll(async () => {
    await database.close();
    await fresh.drop();
  });
  const pendingNames = async () => (await new PostgresUnitOfWork(database).outbox.pending()).map(e => e.event.payload);

  it('keeps what a committed transaction appended pending, oldest first, until it is marked published', async () => {
    const unitOfWork = new PostgresUnitOfWork(database);
    await unitOfWork.beginTransaction();
    const [first, second] = await unitOfWork.outbox.append([
      Greeted.set({ name: 'alice' }),
      Greeted.set({ name: 'bob' }),
    ]);
    await unitOfWork.commitTransaction();

    const pending = await unitOfWork.outbox.pending();
    expect(pending.map(entry => entry.id)).toEqual([first.id, second.id]);
    // What comes back is the event by its name and payload, which is what the bus routes on and a handler reads.
    expect(pending[0].event.name).toBe('Greeted');
    expect(pending[0].event.payload).toEqual({ name: 'alice' });

    await unitOfWork.outbox.markPublished(first.id);
    expect((await unitOfWork.outbox.pending()).map(entry => entry.id)).toEqual([second.id]);
    await unitOfWork.outbox.markPublished(second.id);
    expect(await unitOfWork.outbox.pending()).toEqual([]);
  });

  it('is rolled back with the transaction that appended to it, and refuses to be written outside one', async () => {
    const unitOfWork = new PostgresUnitOfWork(database);
    await unitOfWork.beginTransaction();
    await unitOfWork.outbox.append([Greeted.set({ name: 'rolled back' })]);
    await unitOfWork.rollbackTransaction();
    expect(await pendingNames()).toEqual([]);
    expect(unitOfWork.hasActiveTransaction()).toBe(false);

    await expect(unitOfWork.outbox.append([Greeted.set({ name: 'outside' })])).rejects.toThrow(/open transaction/);
    expect(() => unitOfWork.client).toThrow(/No active transaction/);
  });

  it('gives each unit of work a transaction of its own: nothing is seen before the commit, everything after', async () => {
    const writer = new PostgresUnitOfWork(database);
    const reader = writer.another();
    await writer.beginTransaction();
    await writer.outbox.append([Greeted.set({ name: 'not yet' })]);
    expect(await reader.outbox.pending()).toEqual([]);
    await writer.commitTransaction();
    expect(await pendingNames()).toEqual([{ name: 'not yet' }]);
    await database.query('DELETE FROM outbox');
  });

  it('serializes the writers of one key with lock(), released at the commit, on the transaction’s own connection', async () => {
    const first = new PostgresUnitOfWork(database);
    const second = new PostgresUnitOfWork(database);
    await first.beginTransaction();
    await first.lock('group-1');
    await second.beginTransaction();
    let secondHolds = false;
    const waiting = second.lock('group-1').then(() => (secondHolds = true));
    await settle();
    expect(secondHolds).toBe(false);
    await first.commitTransaction();
    await waiting;
    expect(secondHolds).toBe(true);
    // Another key is never held up.
    const third = new PostgresUnitOfWork(database);
    await third.beginTransaction();
    await third.lock('group-2');
    await third.commitTransaction();
    await second.rollbackTransaction();
  });

  it('puts the in-memory stores of the process back on a rollback, as the in-memory unit of work does', async () => {
    const store = new InMemoryDataSource<{ name: string }>();
    const unitOfWork = new PostgresUnitOfWork(database, [store]);
    store.collection.set('kept', { name: 'kept' });
    await unitOfWork.beginTransaction();
    store.collection.set('undone', { name: 'undone' });
    await unitOfWork.rollbackTransaction();
    expect([...store.collection.keys()]).toEqual(['kept']);
    InMemoryDataSource.all.delete(store);
  });

  it('is relayed as the in-memory outbox is: the entry’s id is the message’s, and the entry is acknowledged once', async () => {
    const bus = new InMemoryEventBus({ eventEmitter: new EventEmitter(), clock: () => new Date() });
    const unitOfWork = new PostgresUnitOfWork(database);
    await unitOfWork.beginTransaction();
    const [entry] = await unitOfWork.outbox.append([Greeted.set({ name: 'relayed' })]);
    await unitOfWork.commitTransaction();

    const context = new ExecutionContext({
      traceId: 'relay',
      auth: {},
      eventBus: bus,
      unitOfWork: unitOfWork.another(),
    });
    const handed = await relayOutbox(unitOfWork.outbox, bus, context);
    expect(handed.map(each => each.id)).toEqual([entry.id]);
    await settle();
    expect(await unitOfWork.outbox.pending()).toEqual([]);
    expect(await relayOutbox(unitOfWork.outbox, bus, context)).toEqual([]);
  });
});
