import { Id } from '@Architecture/Domain';

import { Bookmark } from '@Contexts/Notes/Domain/Bookmark/Bookmark';
import { BookmarkRemovedEvent, NoteBookmarkedEvent } from '@Contexts/Notes/Domain/Bookmark/Events/BookmarkEvents';
import { NotBookmarkOwnerException } from '@Contexts/Notes/Domain/Bookmark/BookmarkExceptions';

const alice = new Id('alice');
const bob = new Id('bob');
const at = new Date('2026-09-29T10:00:00.000Z');

function aBookmark(): Bookmark {
  const bookmark = Bookmark.create({ accountId: alice.value, noteId: 'note-1' }, at);
  bookmark.pullDomainEvents();
  return bookmark;
}

describe('Bookmark', () => {
  describe('bookmarking a note', () => {
    it('picks its own identity, keeps who, which note and when, and records NoteBookmarked', () => {
      const bookmark = Bookmark.create({ accountId: 'alice', noteId: 'note-1' }, at);

      expect(bookmark._id.value).toEqual(expect.any(String));
      expect(bookmark.accountId.value).toBe('alice');
      expect(bookmark.noteId.value).toBe('note-1');
      expect(bookmark.createdAt).toEqual(at);
      expect(bookmark.pullDomainEvents()).toEqual([
        NoteBookmarkedEvent.set({ bookmarkId: bookmark._id.value, noteId: 'note-1', accountId: 'alice' }),
      ]);
    });

    it('gives every bookmark a distinct identity', () => {
      const first = Bookmark.create({ accountId: 'alice', noteId: 'note-1' });
      const second = Bookmark.create({ accountId: 'alice', noteId: 'note-2' });

      expect(first._id.value).not.toEqual(second._id.value);
    });
  });

  describe('removing', () => {
    it('lets the account that bookmarked remove it and records BookmarkRemoved', () => {
      const bookmark = aBookmark();

      expect(bookmark.remove(alice).isSuccess()).toBe(true);
      expect(bookmark.pullDomainEvents()).toEqual([
        BookmarkRemovedEvent.set({ bookmarkId: bookmark._id.value, noteId: 'note-1', accountId: 'alice' }),
      ]);
    });

    it('is reserved to that account', () => {
      const bookmark = aBookmark();

      expect(bookmark.remove(bob).error).toBeInstanceOf(NotBookmarkOwnerException);
      expect(bookmark.pullDomainEvents()).toEqual([]);
    });
  });

  describe('persistence round-trip', () => {
    it('rebuilds from a snapshot without recording any event', () => {
      const bookmark = Bookmark.fromSnapshot({
        _id: 'bookmark-9',
        accountId: 'alice',
        noteId: 'note-1',
        createdAt: at,
        version: 3,
      });

      expect(bookmark._id.value).toBe('bookmark-9');
      expect(bookmark.version).toBe(3);
      expect(bookmark.pullDomainEvents()).toEqual([]);
    });

    it('gives back an equal bookmark after toSnapshot / fromSnapshot', () => {
      const bookmark = aBookmark();

      const rebuilt = Bookmark.fromSnapshot(bookmark.toSnapshot());

      expect(rebuilt.equals(bookmark)).toBe(true);
      expect(rebuilt.toSnapshot()).toEqual(bookmark.toSnapshot());
    });

    it('refuses a corrupted snapshot', () => {
      expect(() =>
        Bookmark.fromSnapshot({ _id: 'b', accountId: '', noteId: 'note-1', createdAt: at, version: 1 }),
      ).toThrow(/Corrupted bookmark b/);
    });
  });
});
