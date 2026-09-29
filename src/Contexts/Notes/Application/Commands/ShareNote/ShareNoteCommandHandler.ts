import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';
import { Id } from '@SharedKernel/Domain/ValueObjects';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteSharing } from '@Contexts/Notes/Domain/Note/NoteSharing';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { ShareNoteCommandEvent } from '@Contexts/Notes/Application/Commands/ShareNote/ShareNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * The use case, and nothing but the use case: who is calling, load the aggregate, hand it to
 * the domain service that holds the one rule the aggregate cannot check alone (the recipient
 * exists), save, publish what was recorded. No rule of its own: everything that can be refused
 * is refused by NoteSharing or by Note, and comes back as a failed Result.
 */
export class ShareNoteCommandHandler extends CommandHandler<ShareNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository, private noteSharing: NoteSharing) {
    super();
  }

  async execute({ payload }: ShareNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context);
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const shared = await this.noteSharing.share(note, actor.data, new Id(payload.recipientId));
    if (shared.isFailure()) return shared;

    await this.noteRepository.save(note);
    this.publishDomainEvents(note, context);

    return Result.ok();
  }
}
