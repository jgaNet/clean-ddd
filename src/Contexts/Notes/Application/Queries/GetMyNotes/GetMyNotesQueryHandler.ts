import { IResult, Result } from '@Architecture/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';

import { INoteQueries, NoteListItem } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class GetMyNotesQueryHandler extends QueryHandler<INoteQueries, void, IResult<NoteListItem[]>> {
  async execute(_: void, context: ExecutionContext): Promise<IResult<NoteListItem[]>> {
    const owner = requireSignedIn(context);
    if (owner.isFailure()) return owner;

    return Result.ok(await this.queries.findByOwner(owner.data.value));
  }
}
