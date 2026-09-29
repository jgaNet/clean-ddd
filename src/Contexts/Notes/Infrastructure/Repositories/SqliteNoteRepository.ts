import { DatabaseSync } from 'node:sqlite';

import { IResult, Result } from '@SharedKernel/Domain';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { staleNote } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { createNotesTable, NoteRow, toRow, toSnapshot } from '@Contexts/Notes/Infrastructure/Sqlite/NotesTable';

/**
 * The same port as InMemoryNoteRepository, over a real database (Node's built-in SQLite).
 * It exists to prove the claim the ports make: the domain and the use cases did not change
 * by one line to get here, and NotePersistence.contract.spec.ts holds both adapters to the
 * same expectations. The local wiring keeps the in-memory one; swap the two constructors in
 * module.local.ts to persist to a file.
 */
export class SqliteNoteRepository implements INoteRepository {
  constructor(private db: DatabaseSync) {
    createNotesTable(db);
  }

  async findById(id: string): Promise<Note | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined;
    return row ? Note.fromSnapshot(toSnapshot(row)) : null;
  }

  /**
   * The optimistic check the way SQL makes it atomic: update only the row still at the version
   * the aggregate was read at; no row changed means someone else wrote first (ADR 8).
   */
  async save(note: Note): Promise<IResult> {
    const row = toRow(note.toSnapshot());
    // Bound to what the statement uses (node:sqlite refuses a spare parameter); an update never moves a note to another owner.
    const { id, title, content, status, shared_with, version } = row;
    const updated = this.db
      .prepare(
        `UPDATE notes SET title = :title, content = :content, status = :status,
           shared_with = :shared_with, version = :version + 1
         WHERE id = :id AND version = :version`,
      )
      .run({ id, title, content, status, shared_with, version });
    if (updated.changes > 0) return Result.ok();

    const stored = this.db.prepare('SELECT version FROM notes WHERE id = ?').get(row.id) as
      Pick<NoteRow, 'version'> | undefined;
    if (stored) return Result.fail(staleNote(row.id, note.version, stored.version));

    this.db
      .prepare(
        `INSERT INTO notes (id, owner_id, title, content, status, shared_with, version)
         VALUES (:id, :owner_id, :title, :content, :status, :shared_with, :version + 1)`,
      )
      .run(row);
    return Result.ok();
  }
}
