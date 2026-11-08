import { DomainEvent } from '@Architecture/Domain';
import { InMemoryOutbox } from './InMemoryOutbox';
import { InMemoryUnitOfWork } from '@Architecture/Infrastructure/UnitOfWork/InMemoryUnitOfWork';

class Greeted extends DomainEvent<{ name: string }> {}

/** The outbox port, held by its in-memory adapter: what is appended is pending, in order, until it is published; and it lives and dies with the transaction. */
describe('InMemoryOutbox', () => {
  it('keeps what is appended pending, oldest first, until it is marked published', async () => {
    const outbox = new InMemoryOutbox();
    const [first, second] = await outbox.append([Greeted.set({ name: 'alice' }), Greeted.set({ name: 'bob' })]);

    expect(await outbox.pending()).toEqual([first, second]);
    expect(first.id).not.toBe(second.id);

    await outbox.markPublished(first.id);
    expect(await outbox.pending()).toEqual([second]);
  });

  it('is rolled back with the transaction that appended to it, and kept by one that commits', async () => {
    const outbox = new InMemoryOutbox();
    const unitOfWork = new InMemoryUnitOfWork([outbox.store], outbox);

    await unitOfWork.beginTransaction();
    await outbox.append([Greeted.set({ name: 'rolled back' })]);
    await unitOfWork.rollbackTransaction();
    expect(await outbox.pending()).toEqual([]);

    await unitOfWork.beginTransaction();
    await outbox.append([Greeted.set({ name: 'committed' })]);
    await unitOfWork.commitTransaction();
    expect((await outbox.pending()).map(entry => entry.event.payload)).toEqual([{ name: 'committed' }]);
  });
});
