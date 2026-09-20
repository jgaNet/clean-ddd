import { QueryHandler, Result } from '@Core/Application';

import { Role } from '@SystemOrchestrator/Helpers';
import { GetOperationsQueryResult } from '@Contexts/Tracker/Application/DTOs';
import { ExecutionContext, IResult } from '@Core/Application';
import { NotAllowedException } from '@SystemOrchestrator/CommonExceptions';
import { ITrackedOperationQueries } from '@Contexts/Tracker/Domain/TrackedOperation/Ports/ITrackedOperationQueries';

type GetOperationsPort = {
  traceId?: string;
};

export class GetOperationsHandler extends QueryHandler<
  ITrackedOperationQueries,
  GetOperationsPort,
  GetOperationsQueryResult
> {
  async execute(filters: GetOperationsPort): Promise<GetOperationsQueryResult> {
    if (filters?.traceId) {
      const operations = await this.queriesService.findByTraceId(filters.traceId);
      return Result.ok(operations);
    }

    const operations = await this.queriesService.findAll();
    return Result.ok(operations);
  }

  protected async guard(_: never, { auth }: ExecutionContext): Promise<IResult> {
    if (!auth.role || ![Role.ADMIN].includes(auth.role)) {
      return Result.fail(new NotAllowedException('Tracker', 'Forbidden'));
    }

    return Result.ok();
  }
}
