import { IResult, Result } from '@Architecture/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';

import { INoteQueries, SharedNoteListItem } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class GetNotesSharedWithMeQueryHandler extends QueryHandler<INoteQueries, void, IResult<SharedNoteListItem[]>> {
  async execute(_: void, context: ExecutionContext): Promise<IResult<SharedNoteListItem[]>> {
    const reader = requireSignedIn(context, 'Notes');
    if (reader.isFailure()) return reader;

    return Result.ok(await this.queries.findSharedWith(reader.data.value));
  }
}
