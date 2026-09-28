import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';
import { Id } from '@SharedKernel/Domain/Utils';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { ShareNoteCommandEvent } from '@Contexts/Notes/Application/Commands/ShareNote/ShareNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class ShareNoteCommandHandler extends CommandHandler<ShareNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  protected async guard(_: ShareNoteCommandEvent, context: ExecutionContext): Promise<IResult<unknown>> {
    return requireSignedIn(context);
  }

  async execute({ payload }: ShareNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context);
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const shared = note.shareWith(actor.data, new Id(payload.recipientId));
    if (shared.isFailure()) return shared;

    await this.noteRepository.save(note);
    this.publishDomainEvents(note, context);

    return Result.ok();
  }
}
