import { expect, jest } from '@jest/globals';

import { NotAllowedException } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';
import { NoteCreatedEvent, NoteSharedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import {
  BlankNoteTitleException,
  NoteArchivedException,
  NoteNotArchivedException,
  NoteNotFoundException,
  NoteNotSharedWithException,
  NotNoteOwnerException,
} from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { INoteReaction } from '@Contexts/Notes/Domain/NoteReaction/DTOs';
import { NoteReacting } from '@Contexts/Notes/Domain/NoteReaction/NoteReacting';
import { UnsupportedReactionEmojiException } from '@Contexts/Notes/Domain/NoteReaction/NoteReactionExceptions';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { InMemoryNoteReactionRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteReactionRepository';
import { NoteSharing } from '@Contexts/Notes/Domain/Note/NoteSharing';
import {
  ArchiveNoteCommandEvent,
  ArchiveNoteCommandHandler,
  CreateNoteCommandEvent,
  CreateNoteCommandHandler,
  EditNoteCommandEvent,
  EditNoteCommandHandler,
  ReactToNoteCommandEvent,
  ReactToNoteCommandHandler,
  RestoreNoteCommandEvent,
  RestoreNoteCommandHandler,
  ShareNoteCommandEvent,
  ShareNoteCommandHandler,
} from '@Contexts/Notes/Application/Commands';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

function contextFor(subjectId: string | undefined, role: Role = Role.USER): ExecutionContext {
  return new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });
}

let store: InMemoryDataSource<INote>;
let repository: InMemoryNoteRepository;
let reactionStore: InMemoryDataSource<INoteReaction>;
let reactions: InMemoryNoteReactionRepository;
// Every account the tests talk about exists; the directory itself is covered by NoteSharing.spec.
const sharing = new NoteSharing({ exists: async id => ['alice', 'bob', 'carol'].includes(id) });

beforeEach(() => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<INote>();
  repository = new InMemoryNoteRepository(store);
  reactionStore = new InMemoryDataSource<INoteReaction>();
  reactions = new InMemoryNoteReactionRepository(reactionStore);
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
      version: 1,
    });
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      NoteCreatedEvent.set({ noteId, ownerId: 'alice', title: 'Groceries' }),
      expect.any(ExecutionContext),
    );
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

describe('ReactToNoteCommandHandler', () => {
  const reactTo = (noteId: string, emoji: string, reactorId: string) =>
    new ReactToNoteCommandHandler(repository, reactions, new NoteReacting(reactions)).execute(
      ReactToNoteCommandEvent.set({ noteId, emoji }),
      contextFor(reactorId),
    );

  async function aNoteSharedWithBob(): Promise<string> {
    const noteId = await aNoteOwnedBy('alice');
    await new ShareNoteCommandHandler(repository, sharing).execute(
      ShareNoteCommandEvent.set({ noteId, recipientId: 'bob' }),
      contextFor('alice'),
    );
    jest.resetAllMocks();
    return noteId;
  }

  it('saves the reaction of someone the note is shared with and publishes NoteReacted', async () => {
    const noteId = await aNoteSharedWithBob();

    const result = await reactTo(noteId, '👍', 'bob');

    expect(result.isSuccess()).toBe(true);
    expect([...reactionStore.collection.values()]).toEqual([
      expect.objectContaining({ noteId, reactorId: 'bob', emoji: '👍', version: 1 }),
    ]);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it('changes the reaction instead of adding a second one', async () => {
    const noteId = await aNoteSharedWithBob();
    await reactTo(noteId, '👍', 'bob');

    const result = await reactTo(noteId, '😂', 'bob');

    expect(result.isSuccess()).toBe(true);
    expect([...reactionStore.collection.values()]).toEqual([
      expect.objectContaining({ noteId, reactorId: 'bob', emoji: '😂', version: 2 }),
    ]);
  });

  it('refuses someone the note is not shared with, and saves nothing', async () => {
    const noteId = await aNoteSharedWithBob();

    const result = await reactTo(noteId, '👍', 'carol');

    expect(result.error).toBeInstanceOf(NoteNotSharedWithException);
    expect(reactionStore.collection.size).toBe(0);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses an emoji the domain does not support', async () => {
    const noteId = await aNoteSharedWithBob();

    const result = await reactTo(noteId, '🦄', 'bob');

    expect(result.error).toBeInstanceOf(UnsupportedReactionEmojiException);
    expect(reactionStore.collection.size).toBe(0);
  });

  it('fails on an unknown note', async () => {
    expect((await reactTo('nope', '👍', 'bob')).error).toBeInstanceOf(NoteNotFoundException);
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

  it('refuses a caller who does not own the note', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new ArchiveNoteCommandHandler(repository).execute(
      ArchiveNoteCommandEvent.set({ noteId }),
      contextFor('bob'),
    );

    expect(result.isFailure()).toBe(true);
    expect(result.error).toBeInstanceOf(NotNoteOwnerException);
    expect(store.collection.get(noteId)?.status).toBe(NoteStatus.ACTIVE);
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
