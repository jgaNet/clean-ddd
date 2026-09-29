import { DatabaseSync } from 'node:sqlite';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';

/**
 * The one table behind the SQLite adapters, and the two conversions between a row and the
 * snapshot the aggregate is rebuilt from. The repository and the queries share it, the way
 * their in-memory counterparts share one InMemoryDataSource: same store, two ports.
 *
 * `shared_with` is a JSON array; SQLite's json_each() lets the queries filter on it without
 * a second table, which is all this reference needs. A real schema would normalise it.
 *
 * A JSON column keeps strings, numbers and booleans as they were, but a Date comes back as a
 * string: revive it in toSnapshot(), or the contract spec's round-trip case will tell you.
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
      shared_with TEXT NOT NULL
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
};

export const toRow = (note: INote): NoteRow => ({
  id: note._id,
  owner_id: note.ownerId,
  title: note.title,
  content: note.content,
  status: note.status,
  shared_with: JSON.stringify(note.sharedWith),
});

export const toSnapshot = (row: NoteRow): INote => ({
  _id: row.id,
  ownerId: row.owner_id,
  title: row.title,
  content: row.content,
  status: row.status as NoteStatus,
  sharedWith: JSON.parse(row.shared_with),
});
