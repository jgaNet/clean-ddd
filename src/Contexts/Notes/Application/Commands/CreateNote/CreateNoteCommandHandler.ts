import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class CreateNoteCommandHandler extends CommandHandler<CreateNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  protected async guard(_: CreateNoteCommandEvent, context: ExecutionContext): Promise<IResult<unknown>> {
    return requireSignedIn(context);
  }

  async execute({ payload }: CreateNoteCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const owner = requireSignedIn(context);
    if (owner.isFailure()) return owner;

    const note = Note.create({ ownerId: owner.data.value, title: payload.title, content: payload.content });
    if (note.isFailure()) return note;

    await this.noteRepository.save(note.data);
    this.publishDomainEvents(note.data, context);

    return Result.ok(note.data._id.value);
  }
}
