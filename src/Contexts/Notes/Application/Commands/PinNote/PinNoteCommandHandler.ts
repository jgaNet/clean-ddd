import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { PinNoteCommandEvent } from '@Contexts/Notes/Application/Commands/PinNote/PinNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class PinNoteCommandHandler extends CommandHandler<PinNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  async execute({ payload }: PinNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context);
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const pinned = note.pin(actor.data);
    if (pinned.isFailure()) return pinned;

    await this.noteRepository.save(note);
    this.publishDomainEvents(note, context);

    return Result.ok();
  }
}
