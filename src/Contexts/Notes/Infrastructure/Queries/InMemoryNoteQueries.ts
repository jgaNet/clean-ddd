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
      pinned: note.pinned,
      ownerId: note.ownerId,
      content: note.content,
      sharedWith: [...note.sharedWith],
    };
  }

  async findByOwner(ownerId: string): Promise<NoteListItem[]> {
    // The Map keeps insertion order and sort() is stable, so pinned notes come first and each group stays in save order.
    return this.all()
      .filter(note => note.ownerId === ownerId)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned))
      .map(note => ({ id: note._id, title: note.title, status: note.status, pinned: note.pinned }));
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
