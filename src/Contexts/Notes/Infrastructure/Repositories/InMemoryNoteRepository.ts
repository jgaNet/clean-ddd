import { ConcurrencyConflictException, IResult, Result } from '@SharedKernel/Domain';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';

/**
 * The repository port on the in-memory store: a snapshot in, a snapshot out. It knows nothing
 * of the aggregate's rules (fromSnapshot and toSnapshot are the aggregate's), and offers only
 * what a use case needs to change one aggregate: find it by id, save it. Searching and listing
 * are the queries' job (InMemoryNoteQueries), on the same store.
 */
export class InMemoryNoteRepository implements INoteRepository {
  constructor(private dataSource: InMemoryDataSource<INote>) {}

  async findById(id: string): Promise<Note | null> {
    const snapshot = this.dataSource.collection.get(id);
    return snapshot ? Note.fromSnapshot(snapshot) : null;
  }

  async save(note: Note): Promise<IResult> {
    const stored = this.dataSource.collection.get(note._id.value);
    if (stored && stored.version !== note.version) {
      return Result.fail(staleNote(note._id.value, note.version, stored.version));
    }
    this.dataSource.collection.set(note._id.value, { ...note.toSnapshot(), version: note.version + 1 });
    return Result.ok();
  }
}

export const staleNote = (noteId: string, read: number, stored: number) =>
  new ConcurrencyConflictException('Notes', 'The note changed since it was read', { noteId, read, stored });
