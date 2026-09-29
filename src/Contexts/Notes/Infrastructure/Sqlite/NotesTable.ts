import { DatabaseSync } from 'node:sqlite';

import { INote, INoteComment } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';

/**
 * The one table behind the SQLite adapters, and the two conversions between a row and the
 * snapshot the aggregate is rebuilt from. The repository and the queries share it, the way
 * their in-memory counterparts share one InMemoryDataSource: same store, two ports.
 *
 * `shared_with` and `comments` are JSON; SQLite's json_each() lets the queries filter on them
 * without a second table, which is all this reference needs. A real schema would normalise
 * both. A comment's `postedAt` travels as an ISO string inside that JSON and is revived as a
 * Date on the way back, so a round-trip gives an equal snapshot.
 *
 * CREATE TABLE IF NOT EXISTS is enough because the store is created per process (an in-memory
 * database in tests). A file database that outlives the code would need a migration for every
 * new column; this reference has no migration mechanism, on purpose.
 */
export function createNotesTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL,
      title       TEXT NOT NULL,
      content     TEXT NOT NULL,
      status      TEXT NOT NULL,
      shared_with TEXT NOT NULL,
      comments    TEXT NOT NULL
    )
  `);
}

/** A type alias, not an interface: node:sqlite binds named parameters from a Record, which an alias satisfies. */
export type NoteRow = {
  id: string;
  owner_id: string;
  title: string;
  content: string;
  status: string;
  shared_with: string;
  comments: string;
};

/** What JSON.stringify made of an INoteComment: the Date became a string. */
type StoredComment = Omit<INoteComment, 'postedAt'> & { postedAt: string };

export const toRow = (note: INote): NoteRow => ({
  id: note._id,
  owner_id: note.ownerId,
  title: note.title,
  content: note.content,
  status: note.status,
  shared_with: JSON.stringify(note.sharedWith),
  comments: JSON.stringify(note.comments),
});

export const toComments = (json: string): INoteComment[] =>
  (JSON.parse(json) as StoredComment[]).map(comment => ({ ...comment, postedAt: new Date(comment.postedAt) }));

export const toSnapshot = (row: NoteRow): INote => ({
  _id: row.id,
  ownerId: row.owner_id,
  title: row.title,
  content: row.content,
  status: row.status as NoteStatus,
  sharedWith: JSON.parse(row.shared_with),
  comments: toComments(row.comments),
});
