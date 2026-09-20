import { Role } from '@SystemOrchestrator/Helpers';

import { GetNotesQueryResult } from '@Contexts/Notes/Application/DTOs';
import { QueryHandler, Result, IResult, ExecutionContext } from '@Core/Application';
import { NotAllowedException } from '@SystemOrchestrator/CommonExceptions';
import { INoteQueries } from '@Contexts/Notes/Domain/Note/Ports/INoteQueries';

export class GetNotesQueryHandler extends QueryHandler<INoteQueries, void, GetNotesQueryResult> {
  protected async guard(_: never, { auth }: ExecutionContext): Promise<IResult> {
    if (!auth.role || ![Role.USER, Role.ADMIN].includes(auth.role)) {
      return Result.fail(new NotAllowedException('Notes', 'Forbidden'));
    }
    return Result.ok();
  }

  async execute(_: void): Promise<GetNotesQueryResult> {
    const notes = await this.queriesService.findAll();
    return Result.ok(notes);
  }
}
