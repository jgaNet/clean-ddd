import { expect, jest } from '@jest/globals';

import { EventBus, ExecutionContext } from '@Architecture/Application';
import { Role } from '@SharedKernel/Domain';
import { NotAllowedException } from '@Architecture/Domain';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { INoteReaction } from '@Contexts/Notes/Domain/NoteReaction/DTOs';
import { InMemoryNoteReactionQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteReactionQueries';
import { GetNoteReactionsQueryHandler } from '@Contexts/Notes/Application/Queries/GetNoteReactions/GetNoteReactionsQueryHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const contextFor = (subjectId: string | undefined, role: Role = Role.USER) =>
  new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });

const notes = new InMemoryDataSource<INote>();
notes.collection.set('note-1', {
  _id: 'note-1',
  ownerId: 'alice',
  title: 'Roadmap',
  content: 'Q4',
  status: NoteStatus.ACTIVE,
  sharedWith: ['bob'],
  version: 1,
});
const reactions = new InMemoryDataSource<INoteReaction>();
reactions.collection.set('reaction-1', {
  _id: 'reaction-1',
  noteId: 'note-1',
  reactorId: 'bob',
  emoji: '👍',
  reactedAt: new Date('2026-01-01T10:00:00.000Z'),
  version: 1,
});

const handler = new GetNoteReactionsQueryHandler(new InMemoryNoteReactionQueries(notes, reactions));

describe('GetNoteReactionsQueryHandler', () => {
  it('shows the reactions to the owner and to the people the note is shared with', async () => {
    expect((await handler.execute('note-1', contextFor('alice'))).data).toEqual([{ reactorId: 'bob', emoji: '👍' }]);
    expect((await handler.execute('note-1', contextFor('bob'))).data).toEqual([{ reactorId: 'bob', emoji: '👍' }]);
  });

  it('hides them, like the note itself, from anyone else', async () => {
    const result = await handler.execute('note-1', contextFor('carol'));

    expect(result.error).toBeInstanceOf(NoteNotFoundException);
  });

  it('answers a note that does not exist the same way', async () => {
    expect((await handler.execute('nope', contextFor('alice'))).error).toBeInstanceOf(NoteNotFoundException);
  });

  it('refuses an anonymous caller', async () => {
    const result = await handler.execute('note-1', contextFor(undefined, Role.GUEST));

    expect(result.error).toBeInstanceOf(NotAllowedException);
  });
});
