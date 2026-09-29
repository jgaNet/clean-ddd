import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { INoteTitleSuggestions, TitleSuggestion } from '@Contexts/Notes/Application/Suggestions/INoteTitleSuggestions';
import { SuggestNoteTitleCommandEvent } from '@Contexts/Notes/Application/Commands/SuggestNoteTitle/SuggestNoteTitleCommandEvent';

/**
 * The canonical example of ADR 7: a decision the domain cannot make from its own state enters
 * it as a value. The handler asks the port (the only non-deterministic step), then hands the
 * suggestion to the aggregate exactly as it would hand it a title typed by the owner: `edit()`
 * applies NoteTitle's rules and the owner-and-active rules, and refuses a blank or too long
 * suggestion like any other. The source proposes; the domain disposes.
 *
 * The suggestion, with its provenance, is the operation's result: the Tracker keeps it, so an
 * accepted title can be traced to the source and the version that proposed it.
 */
export class SuggestNoteTitleCommandHandler extends CommandHandler<SuggestNoteTitleCommandEvent> {
  constructor(
    private noteRepository: INoteRepository,
    private suggestions: INoteTitleSuggestions,
  ) {
    super();
  }

  async execute(
    { payload }: SuggestNoteTitleCommandEvent,
    context: ExecutionContext,
  ): Promise<IResult<TitleSuggestion>> {
    const actor = requireSignedIn(context, 'Notes');
    if (actor.isFailure()) return actor;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const suggestion = await this.suggestions.suggest({ content: note.content });

    const applied = note.edit(actor.data, { title: suggestion.title, content: note.content });
    if (applied.isFailure()) return applied;

    const saved = await this.noteRepository.save(note);
    if (saved.isFailure()) return saved;
    this.publishDomainEvents(note, context);

    return Result.ok(suggestion);
  }
}
