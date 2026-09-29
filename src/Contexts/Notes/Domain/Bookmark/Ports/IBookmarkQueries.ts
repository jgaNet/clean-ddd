/**
 * What a bookmarks screen shows: the note, named, and when it was kept. Plain data shaped for
 * reading; the aggregate never comes back through here.
 */
export interface BookmarkListItem {
  id: string;
  noteId: string;
  title: string;
  bookmarkedAt: Date;
}

export interface IBookmarkQueries {
  /**
   * The bookmarks of one account, most recent first (by the time they were bookmarked; two of the
   * same instant come latest saved first). Ordering is part of this contract: the contract spec
   * asserts it for every adapter, and the query handler never sorts. An account with no bookmarks
   * gets an empty list.
   */
  findByAccount(accountId: string): Promise<BookmarkListItem[]>;
}
