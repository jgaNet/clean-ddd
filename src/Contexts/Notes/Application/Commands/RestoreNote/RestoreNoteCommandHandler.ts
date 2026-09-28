import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { RestoreNoteCommandEvent } from '@Contexts/Notes/Application/Commands/RestoreNote/RestoreNoteCommandEvent';
import { requireSignedIn } from '@Contexts/Notes/Application/Guards';

export class RestoreNoteCommandHandler extends CommandHandler<RestoreNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  protected async guard(_: RestoreNoteCommandEvent, context: ExecutionContext): Promise<IResult<unknown>> {
    return requireSignedIn(context);
  }

  async execute({ payload }: RestoreNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context);
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const restored = note.restore(actor.data);
    if (restored.isFailure()) return restored;

    await this.noteRepository.save(note);
    this.publishDomainEvents(note, context);

    return Result.ok();
  }
}
