import { CommandHandler, ExecutionContext, IResult, Result } from '@SharedKernel/Domain/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { EditNoteCommandEvent } from '@Contexts/Notes/Application/Commands/EditNote/EditNoteCommandEvent';
import { requireSignedIn } from '@Contexts/Notes/Application/Guards';

/**
 * The shape every "change an existing note" use case follows:
 * who is calling -> load the aggregate -> ask it to change -> save -> publish what it recorded.
 */
export class EditNoteCommandHandler extends CommandHandler<EditNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  protected async guard(_: EditNoteCommandEvent, context: ExecutionContext): Promise<IResult<unknown>> {
    return requireSignedIn(context);
  }

  async execute({ payload }: EditNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context);
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const edited = note.edit(actor.data, { title: payload.title, content: payload.content });
    if (edited.isFailure()) return edited;

    await this.noteRepository.save(note);
    this.publishDomainEvents(note, context);

    return Result.ok();
  }
}
