import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import {
  INoteQueries,
  NoteDetail,
  NoteListItem,
  SharedNoteListItem,
} from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';

export class InMemoryNoteQueries implements INoteQueries {
  constructor(private dataSource: InMemoryDataSource<INote>) {}

  async findById(noteId: string): Promise<NoteDetail | null> {
    const note = this.dataSource.collection.get(noteId);
    if (!note) return null;

    return {
      id: note._id,
      title: note.title,
      status: note.status,
      ownerId: note.ownerId,
      content: note.content,
      sharedWith: [...note.sharedWith],
      tags: [...note.tags],
    };
  }

  async findByOwner(ownerId: string): Promise<NoteListItem[]> {
    return this.all()
      .filter(note => note.ownerId === ownerId)
      .map(note => ({ id: note._id, title: note.title, status: note.status }));
  }

  async findSharedWith(accountId: string): Promise<SharedNoteListItem[]> {
    return this.all()
      .filter(note => note.sharedWith.includes(accountId))
      .map(note => ({ id: note._id, title: note.title, content: note.content, ownerId: note.ownerId }));
  }

  private all(): INote[] {
    return [...this.dataSource.collection.values()];
  }
}
