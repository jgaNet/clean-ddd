import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { IBookmark } from '@Contexts/Notes/Domain/Bookmark/DTOs';
import { BookmarkListItem, IBookmarkQueries } from '@Contexts/Notes/Domain/Bookmark/Ports/IBookmarkQueries';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';

/**
 * The read side of bookmarks joins two stores of the same context: the bookmark says which note
 * and when, the note says what it is called. That join is the read side's freedom (ADR 5); the
 * Bookmark aggregate keeps no copy of the title. A bookmark whose note is gone is not shown.
 */
export class InMemoryBookmarkQueries implements IBookmarkQueries {
  constructor(
    private bookmarks: InMemoryDataSource<IBookmark>,
    private notes: InMemoryDataSource<INote>,
  ) {}

  async findByAccount(accountId: string): Promise<BookmarkListItem[]> {
    // Reversed before the (stable) sort, so two bookmarks of the same instant come latest saved first.
    return [...this.bookmarks.collection.values()]
      .reverse()
      .filter(bookmark => bookmark.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .flatMap(bookmark => {
        const note = this.notes.collection.get(bookmark.noteId);
        return note
          ? [{ id: bookmark._id, noteId: note._id, title: note.title, bookmarkedAt: bookmark.createdAt }]
          : [];
      });
  }
}
