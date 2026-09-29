import { IResult } from '@Architecture/Domain';

import { Bookmark } from '@Contexts/Notes/Domain/Bookmark/Bookmark';

/**
 * The write side of bookmarks. It speaks in aggregates and answers the one question the domain
 * asks about the whole collection: is this note already bookmarked by this account? That is a
 * repository question, not a queries one, because the rule is checked on the write side against
 * what is saved. Listing for a screen belongs to IBookmarkQueries.
 */
export interface IBookmarkRepository {
  findById(id: string): Promise<Bookmark | null>;
  /** The bookmark this account holds on this note, if any: there is at most one. */
  findByAccountAndNote(accountId: string, noteId: string): Promise<Bookmark | null>;
  /**
   * Stores the aggregate at version + 1, or refuses it with a ConcurrencyConflictException when the
   * stored version is no longer the one it was loaded with (ADR 8).
   */
  save(bookmark: Bookmark): Promise<IResult>;
  /**
   * Forgets the aggregate. Removing a bookmark is the end of its life, not a state of it, so there
   * is no status to filter on the read side. Refused with a ConcurrencyConflictException when the
   * stored version is no longer the one it was loaded with; forgetting what is already gone is fine.
   */
  delete(bookmark: Bookmark): Promise<IResult>;
}
