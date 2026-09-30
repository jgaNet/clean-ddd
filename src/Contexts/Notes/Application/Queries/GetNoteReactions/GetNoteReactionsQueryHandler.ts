import { IResult, Result } from '@Architecture/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';

import {
  INoteReactionQueries,
  NoteReactionListItem,
} from '@Contexts/Notes/Domain/NoteReaction/Ports/INoteReactionQueries';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * The reactions of a note, for whoever may read the note. The port answers with the note's
 * audience alongside them so that the rule — you see the reactions of a note you can read —
 * is applied here, on one port, and the audience itself never leaves this handler.
 */
export class GetNoteReactionsQueryHandler extends QueryHandler<
  INoteReactionQueries,
  string,
  IResult<NoteReactionListItem[]>
> {
  async execute(noteId: string, context: ExecutionContext): Promise<IResult<NoteReactionListItem[]>> {
    const reader = requireSignedIn(context, 'Notes');
    if (reader.isFailure()) return reader;

    const view = await this.queries.findByNote(noteId);

    // A note someone else owns and did not share with you does not exist, as far as you know.
    const visible = view && (view.ownerId === reader.data.value || view.sharedWith.includes(reader.data.value));
    if (!visible) return Result.fail(new NoteNotFoundException(noteId));

    return Result.ok(view.reactions);
  }
}
