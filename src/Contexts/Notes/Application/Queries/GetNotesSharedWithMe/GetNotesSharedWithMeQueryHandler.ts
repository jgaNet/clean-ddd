import { ExecutionContext, IResult, QueryHandler, Result } from '@SharedKernel/Domain/Application';

import { INoteQueries, SharedNoteListItem } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { requireSignedIn } from '@Contexts/Notes/Application/Guards';

export class GetNotesSharedWithMeQueryHandler extends QueryHandler<INoteQueries, void, IResult<SharedNoteListItem[]>> {
  protected async guard(_: void, context: ExecutionContext): Promise<IResult<unknown>> {
    return requireSignedIn(context);
  }

  async execute(_: void, context: ExecutionContext): Promise<IResult<SharedNoteListItem[]>> {
    const reader = requireSignedIn(context);
    if (reader.isFailure()) return reader;

    return Result.ok(await this.queriesService.findSharedWith(reader.data.value));
  }
}
