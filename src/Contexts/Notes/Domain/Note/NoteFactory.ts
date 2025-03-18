import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { INewNote, INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { IResult, Result } from '@SharedKernel/Domain/Application';
import { BlankNoteException } from './NoteExceptions';
export class NoteFactory {
  #noteRepository: INoteRepository;

  constructor({ noteRepository }: { noteRepository: INoteRepository; noteQueries: INoteQueries }) {
    this.#noteRepository = noteRepository;
  }

  async new(newNoteProps: INewNote): Promise<IResult<Note>> {
    const noteProps = newNoteProps as INote;

    noteProps._id = await this.#noteRepository.nextIdentity();

    if (noteProps.title === '') {
      return Result.fail(new BlankNoteException('Title cannot be blank'));
    }

    return Note.create(noteProps);
  }
}
