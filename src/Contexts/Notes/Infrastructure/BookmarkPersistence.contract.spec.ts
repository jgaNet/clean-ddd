import { ConcurrencyConflictException, Id } from '@Architecture/Domain';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { Bookmark } from '@Contexts/Notes/Domain/Bookmark/Bookmark';
import { IBookmark } from '@Contexts/Notes/Domain/Bookmark/DTOs';
import { IBookmarkQueries } from '@Contexts/Notes/Domain/Bookmark/Ports/IBookmarkQueries';
import { IBookmarkRepository } from '@Contexts/Notes/Domain/Bookmark/Ports/IBookmarkRepository';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { InMemoryBookmarkRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryBookmarkRepository';
import { InMemoryBookmarkQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryBookmarkQueries';

/**
 * The contract of the bookmark ports, written against the ports: `findByAccount` promises an
 * order (most recent first), so the promise is tested here for every adapter, even while there
 * is one. A second adapter is a new entry in `adapters`, and must pass this file unchanged. The
 * notes repository is part of the fixture because the read model names the note.
 */
const adapters: {
  name: string;
  open: () => { repository: IBookmarkRepository; queries: IBookmarkQueries; notes: INoteRepository };
}[] = [
  {
    name: 'in memory',
    open: () => {
      const bookmarks = new InMemoryDataSource<IBookmark>();
      const notes = new InMemoryDataSource<INote>();
      return {
        repository: new InMemoryBookmarkRepository(bookmarks),
        queries: new InMemoryBookmarkQueries(bookmarks, notes),
        notes: new InMemoryNoteRepository(notes),
      };
    },
  },
];

const alice = new Id('alice');
const bob = new Id('bob');
const t1 = new Date('2026-09-29T10:00:00.000Z');
const t2 = new Date('2026-09-29T11:00:00.000Z');
const t3 = new Date('2026-09-29T12:00:00.000Z');

const aNote = (ownerId: Id, title: string): Note => {
  const note = Note.create({ ownerId: ownerId.value, title, content: `content of ${title}` });
  if (note.isFailure()) throw note.error;
  return note.data;
};

describe.each(adapters)('Bookmark persistence over $name', ({ open }) => {
  let repository: IBookmarkRepository;
  let queries: IBookmarkQueries;
  let notes: INoteRepository;
  beforeEach(() => ({ repository, queries, notes } = open()));

  describe('IBookmarkRepository', () => {
    it('gives back an equal aggregate, by id and by (account, note)', async () => {
      const bookmark = Bookmark.create({ accountId: alice.value, noteId: 'note-1' }, t1);
      await repository.save(bookmark);

      const expected = { ...bookmark.toSnapshot(), version: bookmark.version + 1 };
      expect((await repository.findById(bookmark._id.value))?.toSnapshot()).toEqual(expected);
      expect((await repository.findByAccountAndNote(alice.value, 'note-1'))?.toSnapshot()).toEqual(expected);
    });

    it('answers null for an unknown id, and for a pair nobody bookmarked', async () => {
      await repository.save(Bookmark.create({ accountId: alice.value, noteId: 'note-1' }, t1));

      expect(await repository.findById('nobody')).toBeNull();
      expect(await repository.findByAccountAndNote(bob.value, 'note-1')).toBeNull();
      expect(await repository.findByAccountAndNote(alice.value, 'note-2')).toBeNull();
    });

    it('stores version + 1 on every save, and refuses an aggregate that is no longer at the stored version', async () => {
      const bookmark = Bookmark.create({ accountId: alice.value, noteId: 'note-1' }, t1);
      expect(bookmark.version).toBe(0);
      await repository.save(bookmark);

      const mine = (await repository.findById(bookmark._id.value)) as Bookmark;
      const theirs = (await repository.findById(bookmark._id.value)) as Bookmark;
      expect(mine.version).toBe(1);

      expect((await repository.save(mine)).isSuccess()).toBe(true);
      const refused = await repository.save(theirs);
      expect(refused.isFailure()).toBe(true);
      expect(refused.error).toBeInstanceOf(ConcurrencyConflictException);
      expect((await repository.findById(bookmark._id.value))?.version).toBe(2);
    });

    it('forgets a deleted bookmark, so the pair can be bookmarked again', async () => {
      const bookmark = Bookmark.create({ accountId: alice.value, noteId: 'note-1' }, t1);
      await repository.save(bookmark);

      const reread = (await repository.findById(bookmark._id.value)) as Bookmark;
      expect((await repository.delete(reread)).isSuccess()).toBe(true);

      expect(await repository.findById(bookmark._id.value)).toBeNull();
      expect(await repository.findByAccountAndNote(alice.value, 'note-1')).toBeNull();
      expect(
        (await repository.save(Bookmark.create({ accountId: alice.value, noteId: 'note-1' }, t2))).isSuccess(),
      ).toBe(true);
    });

    it('refuses to delete an aggregate that is no longer at the stored version', async () => {
      const bookmark = Bookmark.create({ accountId: alice.value, noteId: 'note-1' }, t1);
      await repository.save(bookmark);
      const reread = (await repository.findById(bookmark._id.value)) as Bookmark;
      await repository.save(reread);

      const refused = await repository.delete(reread);
      expect(refused.error).toBeInstanceOf(ConcurrencyConflictException);
      expect(await repository.findById(bookmark._id.value)).not.toBeNull();
    });

    it('rebuilds without recording events', async () => {
      const bookmark = Bookmark.create({ accountId: alice.value, noteId: 'note-1' }, t1);
      await repository.save(bookmark);

      expect((await repository.findById(bookmark._id.value))?.pullDomainEvents()).toEqual([]);
    });
  });

  describe('IBookmarkQueries', () => {
    it("lists an account's bookmarks, and only theirs, most recent first, named after the note", async () => {
      const first = aNote(alice, 'First');
      const second = aNote(alice, 'Second');
      const third = aNote(bob, 'Third');
      await notes.save(first);
      await notes.save(second);
      await notes.save(third);

      // Saved out of time order on purpose: the order promised is by bookmarking time, not by insertion.
      const oldest = Bookmark.create({ accountId: alice.value, noteId: first._id.value }, t1);
      const newest = Bookmark.create({ accountId: alice.value, noteId: third._id.value }, t3);
      const middle = Bookmark.create({ accountId: alice.value, noteId: second._id.value }, t2);
      await repository.save(newest);
      await repository.save(oldest);
      await repository.save(middle);
      await repository.save(Bookmark.create({ accountId: bob.value, noteId: third._id.value }, t3));

      expect(await queries.findByAccount(alice.value)).toEqual([
        { id: newest._id.value, noteId: third._id.value, title: 'Third', bookmarkedAt: t3 },
        { id: middle._id.value, noteId: second._id.value, title: 'Second', bookmarkedAt: t2 },
        { id: oldest._id.value, noteId: first._id.value, title: 'First', bookmarkedAt: t1 },
      ]);
      expect(await queries.findByAccount('nobody')).toEqual([]);
    });

    it('lists two bookmarks of the same instant latest saved first', async () => {
      const first = aNote(alice, 'First');
      const second = aNote(alice, 'Second');
      await notes.save(first);
      await notes.save(second);
      const earlier = Bookmark.create({ accountId: alice.value, noteId: first._id.value }, t1);
      const later = Bookmark.create({ accountId: alice.value, noteId: second._id.value }, t1);
      await repository.save(earlier);
      await repository.save(later);

      expect((await queries.findByAccount(alice.value)).map(item => item.id)).toEqual([
        later._id.value,
        earlier._id.value,
      ]);
    });

    it('no longer lists a bookmark that was deleted', async () => {
      const note = aNote(alice, 'Kept');
      await notes.save(note);
      const bookmark = Bookmark.create({ accountId: alice.value, noteId: note._id.value }, t1);
      await repository.save(bookmark);
      await repository.delete((await repository.findById(bookmark._id.value)) as Bookmark);

      expect(await queries.findByAccount(alice.value)).toEqual([]);
    });
  });
});
