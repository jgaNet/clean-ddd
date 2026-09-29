import { Id } from '@Architecture/Domain';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { Bookmark } from '@Contexts/Notes/Domain/Bookmark/Bookmark';
import { NoteBookmarking } from '@Contexts/Notes/Domain/Bookmark/NoteBookmarking';
import { IBookmarkRepository } from '@Contexts/Notes/Domain/Bookmark/Ports/IBookmarkRepository';
import { NoteAlreadyBookmarkedException } from '@Contexts/Notes/Domain/Bookmark/BookmarkExceptions';

/** A domain test needs only the port: a list of bookmarks is a repository. */
const repositoryOf = (...bookmarks: Bookmark[]): IBookmarkRepository => ({
  findById: async id => bookmarks.find(b => b._id.value === id) ?? null,
  findByAccountAndNote: async (accountId, noteId) =>
    bookmarks.find(b => b.accountId.value === accountId && b.noteId.value === noteId) ?? null,
  save: async () => {
    throw new Error('not needed here');
  },
  delete: async () => {
    throw new Error('not needed here');
  },
});

const alice = new Id('alice');
const bob = new Id('bob');
const carol = new Id('carol');

function aNoteOf(owner: Id): Note {
  const note = Note.create({ ownerId: owner.value, title: 'Groceries', content: 'Milk' });
  if (note.isFailure()) throw note.error;
  return note.data;
}

describe('NoteBookmarking (domain service)', () => {
  it('lets the owner bookmark their own note', async () => {
    const note = aNoteOf(alice);

    const result = await new NoteBookmarking(repositoryOf()).bookmark(note, alice);

    expect(result.isSuccess()).toBe(true);
    expect(result.data?.accountId.value).toBe('alice');
    expect(result.data?.noteId.value).toBe(note._id.value);
  });

  it('lets an account the note was shared with bookmark it', async () => {
    const note = aNoteOf(alice);
    note.shareWith(alice, bob);

    const result = await new NoteBookmarking(repositoryOf()).bookmark(note, bob);

    expect(result.isSuccess()).toBe(true);
  });

  it('refuses a note the reader cannot see, as if it did not exist', async () => {
    const note = aNoteOf(alice);
    note.shareWith(alice, bob);

    const result = await new NoteBookmarking(repositoryOf()).bookmark(note, carol);

    expect(result.error).toBeInstanceOf(NoteNotFoundException);
  });

  it('refuses a note the account already bookmarked', async () => {
    const note = aNoteOf(alice);
    const existing = Bookmark.create({ accountId: alice.value, noteId: note._id.value });

    const result = await new NoteBookmarking(repositoryOf(existing)).bookmark(note, alice);

    expect(result.error).toBeInstanceOf(NoteAlreadyBookmarkedException);
  });

  it('is at most once per account, not per note: another reader may still bookmark it', async () => {
    const note = aNoteOf(alice);
    note.shareWith(alice, bob);
    const alices = Bookmark.create({ accountId: alice.value, noteId: note._id.value });

    const result = await new NoteBookmarking(repositoryOf(alices)).bookmark(note, bob);

    expect(result.isSuccess()).toBe(true);
  });
});
