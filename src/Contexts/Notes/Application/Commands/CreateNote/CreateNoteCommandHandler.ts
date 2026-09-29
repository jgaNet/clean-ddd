import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class CreateNoteCommandHandler extends CommandHandler<CreateNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  async execute({ payload }: CreateNoteCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const owner = requireSignedIn(context);
    if (owner.isFailure()) return owner;

    const note = Note.create({ ownerId: owner.data.value, title: payload.title, content: payload.content });
    if (note.isFailure()) return note;

    const saved = await this.noteRepository.save(note.data);
    if (saved.isFailure()) return saved;
    this.publishDomainEvents(note.data, context);

    return Result.ok(note.data._id.value);
  }
}
