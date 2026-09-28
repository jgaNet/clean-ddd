import { ExecutionContext, IResult, QueryHandler, Result } from '@SharedKernel/Domain/Application';

import { INoteQueries, NoteListItem } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';
import { requireSignedIn } from '@Contexts/Notes/Application/Guards';

export class GetMyNotesQueryHandler extends QueryHandler<INoteQueries, void, IResult<NoteListItem[]>> {
  protected async guard(_: void, context: ExecutionContext): Promise<IResult<unknown>> {
    return requireSignedIn(context);
  }

  async execute(_: void, context: ExecutionContext): Promise<IResult<NoteListItem[]>> {
    const owner = requireSignedIn(context);
    if (owner.isFailure()) return owner;

    return Result.ok(await this.queriesService.findByOwner(owner.data.value));
  }
}
