import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';

export class InMemoryNoteRepository implements INoteRepository {
  constructor(private dataSource: InMemoryDataSource<INote>) {}

  async findById(id: string): Promise<Note | null> {
    const snapshot = this.dataSource.collection.get(id);
    return snapshot ? Note.fromSnapshot(snapshot) : null;
  }

  async save(note: Note): Promise<void> {
    this.dataSource.collection.set(note._id.value, note.toSnapshot());
  }
}
