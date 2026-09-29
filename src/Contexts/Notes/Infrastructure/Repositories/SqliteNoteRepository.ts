import { DatabaseSync } from 'node:sqlite';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
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

  async save(note: Note): Promise<void> {
    const row = toRow(note.toSnapshot());
    this.db
      .prepare(
        `INSERT INTO notes (id, owner_id, title, content, status, pinned, shared_with)
         VALUES (:id, :owner_id, :title, :content, :status, :pinned, :shared_with)
         ON CONFLICT (id) DO UPDATE SET
           title = excluded.title, content = excluded.content,
           status = excluded.status, pinned = excluded.pinned, shared_with = excluded.shared_with`,
      )
      .run(row);
  }
}
