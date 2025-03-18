import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { Mapper } from '@SharedKernel/Domain/DDD';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';

export class NoteMapperImpl implements Mapper<Note, INote> {
  toJSON(note: Note): INote {
    return {
      _id: note._id.value,
      ownerId: note.ownerId.value,
      content: note.content,
      title: note.title,
    };
  }

  toEntity(note: INote): Note {
    const noteEntity = Note.create(note);

    if (noteEntity.isFailure()) {
      throw noteEntity;
    }

    return noteEntity.data;
  }
}

export const NoteMapper = new NoteMapperImpl();
