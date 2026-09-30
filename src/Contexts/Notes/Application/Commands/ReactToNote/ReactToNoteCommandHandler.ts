import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { NoteReacting } from '@Contexts/Notes/Domain/NoteReaction/NoteReacting';
import { INoteReactionRepository } from '@Contexts/Notes/Domain/NoteReaction/Ports/INoteReactionRepository';
import { ReactToNoteCommandEvent } from '@Contexts/Notes/Application/Commands/ReactToNote/ReactToNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * The use case, and nothing but the use case: who is calling, load the note, hand it to the
 * domain service that holds the rules spanning the note and the whole collection of reactions,
 * save the reaction it gives back — a new one or the one the caller had already left — and
 * publish what it recorded. Every refusal comes from the domain, as a failed Result.
 */
export class ReactToNoteCommandHandler extends CommandHandler<ReactToNoteCommandEvent> {
  constructor(
    private noteRepository: INoteRepository,
    private reactionRepository: INoteReactionRepository,
    private noteReacting: NoteReacting,
  ) {
    super();
  }

  async execute({ payload }: ReactToNoteCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context, 'Notes');
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const reacted = await this.noteReacting.react(note, actor.data, payload.emoji);
    if (reacted.isFailure()) return reacted;

    const saved = await this.reactionRepository.save(reacted.data);
    if (saved.isFailure()) return saved;
    this.publishDomainEvents(reacted.data, context);

    return Result.ok();
  }
}
