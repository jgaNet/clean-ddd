import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { EditNoteCommandEvent } from '@Contexts/Notes/Application/Commands/EditNote/EditNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * The shape every "change an existing note" use case follows:
 * who is calling -> load the aggregate -> ask it to change -> save -> publish what it recorded.
 */
export class EditNoteCommandHandler extends CommandHandler<EditNoteCommandEvent> {
  constructor(private noteRepository: INoteRepository) {
    super();
  }

  async execute({ payload }: EditNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context, 'Notes');
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const edited = note.edit(actor.data, { title: payload.title, content: payload.content });
    if (edited.isFailure()) return edited;

    const saved = await this.noteRepository.save(note);
    if (saved.isFailure()) return saved;
    this.publishDomainEvents(note, context);

    return Result.ok();
  }
}
