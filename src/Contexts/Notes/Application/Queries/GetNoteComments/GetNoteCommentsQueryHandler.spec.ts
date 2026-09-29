import { expect, jest } from '@jest/globals';

import { NotAllowedException, Role } from '@SharedKernel/Domain';
import { Id } from '@SharedKernel/Domain/ValueObjects';
import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';
import { GetNoteCommentsQueryHandler } from '@Contexts/Notes/Application/Queries/GetNoteComments/GetNoteCommentsQueryHandler';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

function contextFor(subjectId: string | undefined, role: Role = Role.USER): ExecutionContext {
  return new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });
}

const alice = new Id('alice');
const bob = new Id('bob');

let handler: GetNoteCommentsQueryHandler;
let noteId: string;

// The in-memory adapters are the doubles: a note owned by alice, shared with bob, with one comment by bob.
beforeEach(async () => {
  const store = new InMemoryDataSource<INote>();
  const note = Note.create({ ownerId: alice.value, title: 'Roadmap', content: 'Q4' });
  if (note.isFailure()) throw note.error;
  note.data.shareWith(alice, bob);
  note.data.comment(bob, 'Looks good');
  await new InMemoryNoteRepository(store).save(note.data);

  noteId = note.data._id.value;
  handler = new GetNoteCommentsQueryHandler(new InMemoryNoteQueries(store));
});

describe('GetNoteCommentsQueryHandler', () => {
  it('shows the comments to the owner', async () => {
    const result = await handler.handle(noteId, contextFor('alice'));

    expect(result.isSuccess()).toBe(true);
    expect(result.data).toEqual([
      { id: expect.any(String), authorId: 'bob', text: 'Looks good', postedAt: expect.any(Date) },
    ]);
  });

  it('shows the comments to an account the note is shared with', async () => {
    const result = await handler.handle(noteId, contextFor('bob'));

    expect(result.isSuccess()).toBe(true);
    expect(result.data).toHaveLength(1);
  });

  it('answers not found to anyone else, as if the note did not exist', async () => {
    const result = await handler.handle(noteId, contextFor('carol'));

    expect(result.error).toBeInstanceOf(NoteNotFoundException);
  });

  it('answers not found for an unknown note', async () => {
    const result = await handler.handle('nope', contextFor('alice'));

    expect(result.error).toBeInstanceOf(NoteNotFoundException);
  });

  it('refuses an anonymous caller', async () => {
    const result = await handler.handle(noteId, contextFor(undefined, Role.GUEST));

    expect(result.error).toBeInstanceOf(NotAllowedException);
  });
});
