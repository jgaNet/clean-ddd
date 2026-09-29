import { DatabaseSync } from 'node:sqlite';

import {
  INoteQueries,
  NoteDetail,
  NoteListItem,
  SharedNoteListItem,
} from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { createNotesTable, NoteRow, toSnapshot } from '@Contexts/Notes/Infrastructure/Sqlite/NotesTable';

/**
 * The read side over SQLite: each query is one SQL statement shaped for its read model, which
 * is the point of separating queries from the repository. See InMemoryNoteQueries for the
 * same port over a Map, and NotePersistence.contract.spec.ts for what both must answer.
 */
export class SqliteNoteQueries implements INoteQueries {
  constructor(private db: DatabaseSync) {
    createNotesTable(db);
  }

  async findById(noteId: string): Promise<NoteDetail | null> {
    const row = this.db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as NoteRow | undefined;
    if (!row) return null;

    const { _id, title, status, ownerId, content, sharedWith, tags } = toSnapshot(row);
    return { id: _id, title, status, ownerId, content, sharedWith, tags };
  }

  async findByOwner(ownerId: string): Promise<NoteListItem[]> {
    const rows = this.db
      .prepare('SELECT id, title, status FROM notes WHERE owner_id = ? ORDER BY rowid')
      .all(ownerId) as Pick<NoteRow, 'id' | 'title' | 'status'>[];

    return rows.map(({ id, title, status }) => ({ id, title, status: status as NoteListItem['status'] }));
  }

  async findSharedWith(accountId: string): Promise<SharedNoteListItem[]> {
    const rows = this.db
      .prepare(
        `SELECT id, title, content, owner_id FROM notes
         WHERE EXISTS (SELECT 1 FROM json_each(notes.shared_with) WHERE value = ?)
         ORDER BY rowid`,
      )
      .all(accountId) as Pick<NoteRow, 'id' | 'title' | 'content' | 'owner_id'>[];

    return rows.map(({ id, title, content, owner_id }) => ({ id, title, content, ownerId: owner_id }));
  }
}
