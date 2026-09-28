import { IResult, Result } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@SharedKernel/Application';

import { INoteQueries, NoteListItem } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

export class GetMyNotesQueryHandler extends QueryHandler<INoteQueries, void, IResult<NoteListItem[]>> {
  async execute(_: void, context: ExecutionContext): Promise<IResult<NoteListItem[]>> {
    const owner = requireSignedIn(context);
    if (owner.isFailure()) return owner;

    return Result.ok(await this.queriesService.findByOwner(owner.data.value));
  }
}
