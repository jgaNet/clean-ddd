import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { UnpinNoteCommandEvent } from '@Contexts/Notes/Application/Commands/UnpinNote/UnpinNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class UnpinNoteCommandHandler extends CommandHandler<UnpinNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  async execute({ payload }: UnpinNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context);
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const unpinned = note.unpin(actor.data);
    if (unpinned.isFailure()) return unpinned;

    await this.noteRepository.save(note);
    this.publishDomainEvents(note, context);

    return Result.ok();
  }
}
