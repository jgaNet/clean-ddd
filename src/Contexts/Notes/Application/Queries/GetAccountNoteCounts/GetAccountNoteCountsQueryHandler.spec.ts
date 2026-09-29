import { jest } from '@jest/globals';

import { NotAllowedException, Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { GetAccountNoteCountsQueryHandler } from '@Contexts/Notes/Application/Queries';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

function contextFor(subjectId: string | undefined, role: Role): ExecutionContext {
  return new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });
}

let handler: GetAccountNoteCountsQueryHandler;

beforeEach(async () => {
  const store = new InMemoryDataSource<INote>();
  const repository = new InMemoryNoteRepository(store);
  handler = new GetAccountNoteCountsQueryHandler(new InMemoryNoteQueries(store));

  const mine = Note.create({ ownerId: 'alice', title: 'Mine', content: '...' });
  const shared = Note.create({ ownerId: 'bob', title: 'Shared', content: '...' });
  if (mine.isFailure() || shared.isFailure()) throw new Error('fixture');
  shared.data.shareWith(shared.data.ownerId, mine.data.ownerId);
  await repository.save(mine.data);
  await repository.save(shared.data);
});

describe('GetAccountNoteCountsQueryHandler', () => {
  it('answers an administrator with the counts of any account', async () => {
    const result = await handler.handle('alice', contextFor('root', Role.ADMIN));

    expect(result.isSuccess()).toBe(true);
    expect(result.data).toEqual({ owned: 1, sharedWith: 1 });
  });

  it('refuses a user, even about their own account', async () => {
    const result = await handler.handle('alice', contextFor('alice', Role.USER));

    expect(result.error).toBeInstanceOf(NotAllowedException);
  });

  it('refuses an anonymous caller', async () => {
    const result = await handler.handle('alice', contextFor(undefined, Role.GUEST));

    expect(result.error).toBeInstanceOf(NotAllowedException);
  });
});
