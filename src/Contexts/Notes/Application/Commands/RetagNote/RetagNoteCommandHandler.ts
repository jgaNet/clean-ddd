import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { RetagNoteCommandEvent } from '@Contexts/Notes/Application/Commands/RetagNote/RetagNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * Replaces the tags of a note. Same shape as EditNoteCommandHandler: who is calling -> load
 * the aggregate -> ask it to change -> save -> publish what it recorded. Every rule about
 * tags (owner only, not archived, valid, at most five, none twice) is the aggregate's.
 */
export class RetagNoteCommandHandler extends CommandHandler<RetagNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  async execute({ payload }: RetagNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context);
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const retagged = note.retag(actor.data, payload.tags);
    if (retagged.isFailure()) return retagged;

    await this.noteRepository.save(note);
    this.publishDomainEvents(note, context);

    return Result.ok();
  }
}
