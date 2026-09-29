/**
 * Snapshot of a Bookmark: the plain data the aggregate is persisted as and rebuilt from.
 * The aggregate (Bookmark.ts) owns the behaviour; this type owns nothing.
 */
export interface IBookmark {
  _id: string;
  /** The account that bookmarked the note: a bookmark belongs to its reader, not to the note. */
  accountId: string;
  noteId: string;
  createdAt: Date;
  /** The version this snapshot was read at; the repository stores version + 1 (ADR 8). */
  version: number;
}

/** What is needed to bookmark a note. */
export type INewBookmark = Pick<IBookmark, 'accountId' | 'noteId'>;
