import { ConcurrencyConflictException, IResult, Result } from '@Architecture/Domain';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { Bookmark } from '@Contexts/Notes/Domain/Bookmark/Bookmark';
import { IBookmark } from '@Contexts/Notes/Domain/Bookmark/DTOs';
import { IBookmarkRepository } from '@Contexts/Notes/Domain/Bookmark/Ports/IBookmarkRepository';

/**
 * The bookmark repository port on the in-memory store: a snapshot in, a snapshot out, the same
 * optimistic check as InMemoryNoteRepository (ADR 8). `findByAccountAndNote` is the one lookup
 * the write side needs beyond the id, because the "at most once" rule is checked against what
 * is saved.
 */
export class InMemoryBookmarkRepository implements IBookmarkRepository {
  constructor(private dataSource: InMemoryDataSource<IBookmark>) {}

  async findById(id: string): Promise<Bookmark | null> {
    const snapshot = this.dataSource.collection.get(id);
    return snapshot ? Bookmark.fromSnapshot(snapshot) : null;
  }

  async findByAccountAndNote(accountId: string, noteId: string): Promise<Bookmark | null> {
    const snapshot = [...this.dataSource.collection.values()].find(
      bookmark => bookmark.accountId === accountId && bookmark.noteId === noteId,
    );
    return snapshot ? Bookmark.fromSnapshot(snapshot) : null;
  }

  async save(bookmark: Bookmark): Promise<IResult> {
    const stale = this.staleCheck(bookmark);
    if (stale.isFailure()) return stale;

    this.dataSource.collection.set(bookmark._id.value, { ...bookmark.toSnapshot(), version: bookmark.version + 1 });
    return Result.ok();
  }

  async delete(bookmark: Bookmark): Promise<IResult> {
    const stale = this.staleCheck(bookmark);
    if (stale.isFailure()) return stale;

    this.dataSource.collection.delete(bookmark._id.value);
    return Result.ok();
  }

  private staleCheck(bookmark: Bookmark): IResult {
    const stored = this.dataSource.collection.get(bookmark._id.value);
    if (stored && stored.version !== bookmark.version) {
      return Result.fail(staleBookmark(bookmark._id.value, bookmark.version, stored.version));
    }
    return Result.ok();
  }
}

export const staleBookmark = (bookmarkId: string, read: number, stored: number) =>
  new ConcurrencyConflictException('Notes', 'The bookmark changed since it was read', { bookmarkId, read, stored });
