import { QueryHandler, Result } from '@SharedKernel/Domain/Application';

import { Role } from '@SharedKernel/Domain/AccessControl';
import { GetOperationsQueryResult } from '@Contexts/Tracker/Application/DTOs';
import { ExecutionContext, IResult, NotAllowedException } from '@SharedKernel/Domain/Application';
import { ITrackedOperationQueries } from '@Contexts/Tracker/Domain/TrackedOperation/Ports/ITrackedOperationQueries';

export class GetOperationsHandler extends QueryHandler<ITrackedOperationQueries, void, GetOperationsQueryResult> {
  protected async guard(_: never, { auth }: ExecutionContext): Promise<IResult> {
    if (!auth.role || ![Role.ADMIN].includes(auth.role)) {
      return Result.fail(new NotAllowedException('Tracker', 'Forbidden'));
    }

    return Result.ok();
  }
  async execute(): Promise<GetOperationsQueryResult> {
    const operations = await this.queriesService.findAll();
    return Result.ok(operations);
  }
}
