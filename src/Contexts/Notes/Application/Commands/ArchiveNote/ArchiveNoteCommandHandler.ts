import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { ArchiveNoteCommandEvent } from '@Contexts/Notes/Application/Commands/ArchiveNote/ArchiveNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class ArchiveNoteCommandHandler extends CommandHandler<ArchiveNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  async execute({ payload }: ArchiveNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context);
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const archived = note.archive(actor.data);
    if (archived.isFailure()) return archived;

    const saved = await this.noteRepository.save(note);
    if (saved.isFailure()) return saved;
    this.publishDomainEvents(note, context);

    return Result.ok();
  }
}
