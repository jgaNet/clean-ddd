import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteCreation } from '@Contexts/Notes/Domain/Note/NoteCreation';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * Who is calling, then the domain service that holds the one rule a new Note cannot check
 * alone (how many notes the caller's plan allows), save, publish what was recorded.
 */
export class CreateNoteCommandHandler extends CommandHandler<CreateNoteCommandEvent> {
  constructor(
    private noteRepository: INoteRepository,
    private noteCreation: NoteCreation,
  ) {
    super();
  }

  async execute({ payload }: CreateNoteCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const owner = requireSignedIn(context);
    if (owner.isFailure()) return owner;

    const note = await this.noteCreation.create({
      ownerId: owner.data.value,
      title: payload.title,
      content: payload.content,
    });
    if (note.isFailure()) return note;

    await this.noteRepository.save(note.data);
    this.publishDomainEvents(note.data, context);

    return Result.ok(note.data._id.value);
  }
}
