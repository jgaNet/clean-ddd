import { expect, jest } from '@jest/globals';

import { NotAllowedException } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';
import { EventBus, ExecutionContext } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { NoteSharing } from '@Contexts/Notes/Domain/Note/NoteSharing';
import { IBookmark } from '@Contexts/Notes/Domain/Bookmark/DTOs';
import { NoteBookmarking } from '@Contexts/Notes/Domain/Bookmark/NoteBookmarking';
import { BookmarkRemovedEvent, NoteBookmarkedEvent } from '@Contexts/Notes/Domain/Bookmark/Events/BookmarkEvents';
import {
  BookmarkNotFoundException,
  NoteAlreadyBookmarkedException,
} from '@Contexts/Notes/Domain/Bookmark/BookmarkExceptions';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { InMemoryBookmarkRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryBookmarkRepository';
import {
  BookmarkNoteCommandEvent,
  BookmarkNoteCommandHandler,
  CreateNoteCommandEvent,
  CreateNoteCommandHandler,
  RemoveBookmarkCommandEvent,
  RemoveBookmarkCommandHandler,
  ShareNoteCommandEvent,
  ShareNoteCommandHandler,
} from '@Contexts/Notes/Application/Commands';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;

function contextFor(subjectId: string | undefined, role: Role = Role.USER): ExecutionContext {
  return new ExecutionContext({ traceId: 'trace', eventBus, auth: { subjectId, role } });
}

let notes: InMemoryNoteRepository;
let bookmarkStore: InMemoryDataSource<IBookmark>;
let bookmarks: InMemoryBookmarkRepository;
let bookmarking: NoteBookmarking;
const sharing = new NoteSharing({ exists: async id => ['alice', 'bob', 'carol'].includes(id) });

beforeEach(() => {
  jest.resetAllMocks();
  notes = new InMemoryNoteRepository(new InMemoryDataSource<INote>());
  bookmarkStore = new InMemoryDataSource<IBookmark>();
  bookmarks = new InMemoryBookmarkRepository(bookmarkStore);
  bookmarking = new NoteBookmarking(bookmarks);
});

async function aNoteOwnedBy(ownerId: string, sharedWith?: string): Promise<string> {
  const created = await new CreateNoteCommandHandler(notes).execute(
    CreateNoteCommandEvent.set({ title: 'Groceries', content: 'Milk' }),
    contextFor(ownerId),
  );
  if (created.isFailure()) throw created.error;
  if (sharedWith) {
    await new ShareNoteCommandHandler(notes, sharing).execute(
      ShareNoteCommandEvent.set({ noteId: created.data, recipientId: sharedWith }),
      contextFor(ownerId),
    );
  }
  jest.resetAllMocks();
  return created.data;
}

const bookmarkNote = (noteId: string, by: string) =>
  new BookmarkNoteCommandHandler(notes, bookmarks, bookmarking).execute(
    BookmarkNoteCommandEvent.set({ noteId }),
    contextFor(by),
  );

const removeBookmark = (noteId: string, by: string) =>
  new RemoveBookmarkCommandHandler(bookmarks).execute(RemoveBookmarkCommandEvent.set({ noteId }), contextFor(by));

describe('BookmarkNoteCommandHandler', () => {
  it('lets the owner bookmark their note and publishes NoteBookmarked', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await bookmarkNote(noteId, 'alice');

    expect(result.isSuccess()).toBe(true);
    const bookmarkId = result.data as string;
    expect(bookmarkStore.collection.get(bookmarkId)).toEqual({
      _id: bookmarkId,
      accountId: 'alice',
      noteId,
      createdAt: expect.any(Date),
      version: 1,
    });
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(eventBus.publish).toHaveBeenCalledWith(
      NoteBookmarkedEvent.set({ bookmarkId, noteId, accountId: 'alice' }),
      expect.any(ExecutionContext),
    );
  });

  it('lets an account the note was shared with bookmark it', async () => {
    const noteId = await aNoteOwnedBy('alice', 'bob');

    expect((await bookmarkNote(noteId, 'bob')).isSuccess()).toBe(true);
  });

  it('refuses a note the caller cannot see, as not found, and saves nothing', async () => {
    const noteId = await aNoteOwnedBy('alice', 'bob');

    const result = await bookmarkNote(noteId, 'carol');

    expect(result.error).toBeInstanceOf(NoteNotFoundException);
    expect(bookmarkStore.collection.size).toBe(0);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('refuses to bookmark the same note twice', async () => {
    const noteId = await aNoteOwnedBy('alice');
    await bookmarkNote(noteId, 'alice');

    const result = await bookmarkNote(noteId, 'alice');

    expect(result.error).toBeInstanceOf(NoteAlreadyBookmarkedException);
    expect(bookmarkStore.collection.size).toBe(1);
  });

  it('fails on an unknown note', async () => {
    expect((await bookmarkNote('nope', 'alice')).error).toBeInstanceOf(NoteNotFoundException);
  });

  it('refuses an anonymous caller', async () => {
    const noteId = await aNoteOwnedBy('alice');

    const result = await new BookmarkNoteCommandHandler(notes, bookmarks, bookmarking).execute(
      BookmarkNoteCommandEvent.set({ noteId }),
      contextFor(undefined, Role.GUEST),
    );

    expect(result.error).toBeInstanceOf(NotAllowedException);
    expect(bookmarkStore.collection.size).toBe(0);
  });
});

describe('RemoveBookmarkCommandHandler', () => {
  it('removes the caller’s bookmark and publishes BookmarkRemoved', async () => {
    const noteId = await aNoteOwnedBy('alice');
    const bookmarkId = (await bookmarkNote(noteId, 'alice')).data as string;
    jest.resetAllMocks();

    const result = await removeBookmark(noteId, 'alice');

    expect(result.isSuccess()).toBe(true);
    expect(bookmarkStore.collection.size).toBe(0);
    expect(eventBus.publish).toHaveBeenCalledWith(
      BookmarkRemovedEvent.set({ bookmarkId, noteId, accountId: 'alice' }),
      expect.any(ExecutionContext),
    );
  });

  it('only removes the caller’s own bookmark: another reader’s stays', async () => {
    const noteId = await aNoteOwnedBy('alice', 'bob');
    await bookmarkNote(noteId, 'alice');

    const result = await removeBookmark(noteId, 'bob');

    expect(result.error).toBeInstanceOf(BookmarkNotFoundException);
    expect(bookmarkStore.collection.size).toBe(1);
  });

  it('lets the note be bookmarked again once removed', async () => {
    const noteId = await aNoteOwnedBy('alice');
    await bookmarkNote(noteId, 'alice');
    await removeBookmark(noteId, 'alice');

    expect((await bookmarkNote(noteId, 'alice')).isSuccess()).toBe(true);
  });
});
