import { IResult, Result } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@SharedKernel/Application';

import { INoteQueries, NoteDetail } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class GetNoteQueryHandler extends QueryHandler<INoteQueries, string, IResult<NoteDetail>> {
  async execute(noteId: string, context: ExecutionContext): Promise<IResult<NoteDetail>> {
    const reader = requireSignedIn(context);
    if (reader.isFailure()) return reader;

    const note = await this.queriesService.findById(noteId);

    // A note someone else owns and did not share with you does not exist, as far as you know.
    const visible = note && (note.ownerId === reader.data.value || note.sharedWith.includes(reader.data.value));
    if (!visible) return Result.fail(new NoteNotFoundException(noteId));

    return Result.ok(note);
  }
}
