import { expect, jest } from '@jest/globals';

import { NotAllowedException, Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';
import { NoteCreatedEvent, NoteRetaggedEvent, NoteSharedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import {
  BlankNoteTitleException,
  InvalidNoteTagException,
  NoteArchivedException,
  NoteNotArchivedException,
  NoteNotFoundException,
  NotNoteOwnerException,
  TooManyNoteTagsException,
} from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { NoteSharing } from '@Contexts/Notes/Domain/Note/NoteSharing';
import {
  ArchiveNoteCommandEvent,
  ArchiveNoteCommandHandler,
  CreateNoteCommandEvent,
  CreateNoteCommandHandler,
  EditNoteCommandEvent,
  EditNoteCommandHandler,
  RestoreNoteCommandEvent,
  RestoreNoteCommandHandler,
  RetagNoteCommandEvent,
  RetagNoteCommandHandler,
  ShareNoteCommandEvent,
  ShareNoteCommandHandler,
} from '@Contexts/Notes/Application/Commands';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

function contextFor(subjectId: string | undefined, role: Role = Role.USER): ExecutionContext {
  return new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });
}

let store: InMemoryDataSource<INote>;
let repository: InMemoryNoteRepository;
// Every account the tests talk about exists; the directory itself is covered by NoteSharing.spec.
const sharing = new NoteSharing({ exists: async id => ['alice', 'bob', 'carol'].includes(id) });

beforeEach(() => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<INote>();
  repository = new InMemoryNoteRepository(store);
});

async function aNoteOwnedBy(ownerId: string): Promise<string> {
  const result = await new CreateNoteCommandHandler(repository).execute(
    CreateNoteCommandEvent.set({ title: 'Groceries', content: 'Milk' }),
    contextFor(ownerId),
  );
  if (result.isFailure()) throw result.error;
  jest.resetAllMocks();
  return result.data;
}

describe('CreateNoteCommandHandler', () => {
  it('saves a new active note owned by the caller and publishes NoteCreated', async () => {
    const result = await new CreateNoteCommandHandler(repository).execute(
      CreateNoteCommandEvent.set({ title: 'Groceries', content: 'Milk' }),
      contextFor('alice'),
    );

    expect(result.isSuccess()).toBe(true);
    const noteId = result.data as string;
    expect(store.collection.get(noteId)).toEqual({
      _id: noteId,
      ownerId: 'alice',
      title: 'Groceries',
      content: 'Milk',
      status: NoteStatus.ACTIVE,
      sharedWith: [],
      tags: [],
    });
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      NoteCreatedEvent.set({ noteId, ownerId: 'alice', title: 'Groceries' }),
      expect.any(ExecutionContext),
    );
  });

  it('saves the tags the note was written with', async () => {
    const result = await new CreateNoteCommandHandler(repository).execute(
      CreateNoteCommandEvent.set({ title: 'Groceries', content: 'Milk', tags: ['food', 'weekly'] }),
      contextFor('alice'),
    );

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(result.data as string)?.tags).toEqual(['food', 'weekly']);
  });

  it('refuses an invalid tag and saves nothing', async () => {
    const result = await new CreateNoteCommandHandler(repository).execute(
      CreateNoteCommandEvent.set({ title: 'Groceries', content: 'Milk', tags: ['Not Valid'] }),
      contextFor('alice'),
    );

    expect(result.error).toBeInstanceOf(InvalidNoteTagException);
    expect(store.collection.size).toBe(0);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses a blank title and saves nothing', async () => {
    const result = await new CreateNoteCommandHandler(repository).execute(
      CreateNoteCommandEvent.set({ title: '   ', content: 'Milk' }),
      contextFor('alice'),
    );

    expect(result.error).toBeInstanceOf(BlankNoteTitleException);
    expect(store.collection.size).toBe(0);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    const result = await new CreateNoteCommandHandler(repository).execute(
      CreateNoteCommandEvent.set({ title: 'Groceries', content: 'Milk' }),
      contextFor(undefined, Role.GUEST),
    );

    expect(result.error).toBeInstanceOf(NotAllowedException);
    expect(store.collection.size).toBe(0);
  });
});

describe('ShareNoteCommandHandler', () => {
  it('lets the owner share a note and publishes NoteShared', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new ShareNoteCommandHandler(repository, sharing).execute(
      ShareNoteCommandEvent.set({ noteId, recipientId: 'bob' }),
      contextFor('alice'),
    );

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(noteId)?.sharedWith).toEqual(['bob']);
    expect(eventBus.publish).toHaveBeenCalledWith(
      NoteSharedEvent.set({ noteId, title: 'Groceries', ownerId: 'alice', recipientId: 'bob' }),
      expect.any(ExecutionContext),
    );
  });

  it('refuses a caller who does not own the note', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new ShareNoteCommandHandler(repository, sharing).execute(
      ShareNoteCommandEvent.set({ noteId, recipientId: 'carol' }),
      contextFor('bob'),
    );

    expect(result.error).toBeInstanceOf(NotNoteOwnerException);
    expect(store.collection.get(noteId)?.sharedWith).toEqual([]);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('fails on an unknown note', async () => {
    const result = await new ShareNoteCommandHandler(repository, sharing).execute(
      ShareNoteCommandEvent.set({ noteId: 'nope', recipientId: 'bob' }),
      contextFor('alice'),
    );

    expect(result.error).toBeInstanceOf(NoteNotFoundException);
  });
});

describe('ArchiveNoteCommandHandler', () => {
  it('archives the note', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new ArchiveNoteCommandHandler(repository).execute(
      ArchiveNoteCommandEvent.set({ noteId }),
      contextFor('alice'),
    );

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(noteId)?.status).toBe(NoteStatus.ARCHIVED);
  });
});

describe('EditNoteCommandHandler', () => {
  it('lets the owner change title and content', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new EditNoteCommandHandler(repository).execute(
      EditNoteCommandEvent.set({ noteId, title: 'Errands', content: 'Milk, bread' }),
      contextFor('alice'),
    );

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(noteId)).toMatchObject({ title: 'Errands', content: 'Milk, bread' });
  });

  it('refuses to edit an archived note', async () => {
    const noteId = await aNoteOwnedBy('alice');
    await new ArchiveNoteCommandHandler(repository).execute(
      ArchiveNoteCommandEvent.set({ noteId }),
      contextFor('alice'),
    );

    const result = await new EditNoteCommandHandler(repository).execute(
      EditNoteCommandEvent.set({ noteId, title: 'Errands', content: 'Milk' }),
      contextFor('alice'),
    );

    expect(result.isFailure()).toBe(true);
    expect(result.error).toBeInstanceOf(NoteArchivedException);
    expect(store.collection.get(noteId)?.title).toBe('Groceries');
  });
});

describe('RetagNoteCommandHandler', () => {
  it('lets the owner replace the tags and publishes NoteRetagged', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new RetagNoteCommandHandler(repository).execute(
      RetagNoteCommandEvent.set({ noteId, tags: ['food', 'urgent'] }),
      contextFor('alice'),
    );

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(noteId)?.tags).toEqual(['food', 'urgent']);
    expect(eventBus.publish).toHaveBeenCalledWith(
      NoteRetaggedEvent.set({ noteId, tags: ['food', 'urgent'] }),
      expect.any(ExecutionContext),
    );
  });

  it('refuses a caller who does not own the note', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new RetagNoteCommandHandler(repository).execute(
      RetagNoteCommandEvent.set({ noteId, tags: ['food'] }),
      contextFor('bob'),
    );

    expect(result.error).toBeInstanceOf(NotNoteOwnerException);
    expect(store.collection.get(noteId)?.tags).toEqual([]);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses more than five tags and keeps the note as it was', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new RetagNoteCommandHandler(repository).execute(
      RetagNoteCommandEvent.set({ noteId, tags: ['t1', 't2', 't3', 't4', 't5', 't6'] }),
      contextFor('alice'),
    );

    expect(result.error).toBeInstanceOf(TooManyNoteTagsException);
    expect(store.collection.get(noteId)?.tags).toEqual([]);
  });

  it('fails on an unknown note', async () => {
    const result = await new RetagNoteCommandHandler(repository).execute(
      RetagNoteCommandEvent.set({ noteId: 'nope', tags: ['food'] }),
      contextFor('alice'),
    );

    expect(result.error).toBeInstanceOf(NoteNotFoundException);
  });
});

describe('RestoreNoteCommandHandler', () => {
  it('restores an archived note', async () => {
    const noteId = await aNoteOwnedBy('alice');
    await new ArchiveNoteCommandHandler(repository).execute(
      ArchiveNoteCommandEvent.set({ noteId }),
      contextFor('alice'),
    );

    const result = await new RestoreNoteCommandHandler(repository).execute(
      RestoreNoteCommandEvent.set({ noteId }),
      contextFor('alice'),
    );

    expect(result.isSuccess()).toBe(true);
    expect(store.collection.get(noteId)?.status).toBe(NoteStatus.ACTIVE);
  });

  it('refuses to restore a note that is not archived', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new RestoreNoteCommandHandler(repository).execute(
      RestoreNoteCommandEvent.set({ noteId }),
      contextFor('alice'),
    );

    expect(result.isFailure()).toBe(true);
    expect(result.error).toBeInstanceOf(NoteNotArchivedException);
  });
});
