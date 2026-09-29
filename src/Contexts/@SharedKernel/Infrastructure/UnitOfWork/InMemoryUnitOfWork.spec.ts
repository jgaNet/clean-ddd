import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryUnitOfWork } from './InMemoryUnitOfWork';

describe('InMemoryUnitOfWork', () => {
  let notes: InMemoryDataSource<{ title: string }>;
  let accounts: InMemoryDataSource<{ email: string }>;
  let unitOfWork: InMemoryUnitOfWork;

  beforeEach(() => {
    notes = new InMemoryDataSource();
    accounts = new InMemoryDataSource();
    notes.collection.set('n1', { title: 'before' });
    unitOfWork = new InMemoryUnitOfWork([notes, accounts]);
  });

  it('keeps what a committed transaction wrote', async () => {
    await unitOfWork.beginTransaction();
    notes.collection.set('n1', { title: 'after' });
    accounts.collection.set('a1', { email: 'alice@example.com' });
    await unitOfWork.commitTransaction();

    expect(notes.collection.get('n1')).toEqual({ title: 'after' });
    expect(accounts.collection.get('a1')).toEqual({ email: 'alice@example.com' });
  });

  it('puts every store back as it was when the transaction rolls back', async () => {
    const before = { notes: new Map(notes.collection), accounts: new Map(accounts.collection) };

    await unitOfWork.beginTransaction();
    notes.collection.set('n1', { title: 'after' });
    notes.collection.set('n2', { title: 'new' });
    accounts.collection.set('a1', { email: 'alice@example.com' });
    await unitOfWork.rollbackTransaction();

    expect(notes.collection).toEqual(before.notes);
    expect(accounts.collection).toEqual(before.accounts);
    expect(unitOfWork.hasActiveTransaction()).toBe(false);
  });

  it('allows one transaction at a time, and only commits or rolls back an open one', async () => {
    await expect(unitOfWork.commitTransaction()).rejects.toThrow('No active transaction');
    await expect(unitOfWork.rollbackTransaction()).rejects.toThrow('No active transaction');

    await unitOfWork.beginTransaction();
    await expect(unitOfWork.beginTransaction()).rejects.toThrow('already in progress');
  });
});
