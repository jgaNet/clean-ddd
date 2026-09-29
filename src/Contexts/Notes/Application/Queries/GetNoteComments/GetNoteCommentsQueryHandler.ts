import { IResult, Result } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@SharedKernel/Application';

import { INoteQueries, NoteCommentListItem } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * The comments of a note, for everyone who has access to it: its owner and the accounts it
 * is shared with. The same visibility rule as GetNote, answered from the same read model: to
 * anyone else the note, and so its comments, do not exist.
 */
export class GetNoteCommentsQueryHandler extends QueryHandler<INoteQueries, string, IResult<NoteCommentListItem[]>> {
  async execute(noteId: string, context: ExecutionContext): Promise<IResult<NoteCommentListItem[]>> {
    const reader = requireSignedIn(context);
    if (reader.isFailure()) return reader;

    const note = await this.queries.findById(noteId);

    const visible = note && (note.ownerId === reader.data.value || note.sharedWith.includes(reader.data.value));
    if (!visible) return Result.fail(new NoteNotFoundException(noteId));

    return Result.ok(await this.queries.findComments(noteId));
  }
}
