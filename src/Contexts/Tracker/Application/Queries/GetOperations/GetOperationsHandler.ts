import { QueryHandler, Result } from '@SharedKernel/Domain/Application';

import { GetOperationsQueryResult } from '@Contexts/Tracker/Application/DTOs';
import { ITrackedOperationQueries } from '@Contexts/Tracker/Domain/TrackedOperation/Ports/ITrackedOperationQueries';

export class GetOperationsHandler extends QueryHandler<ITrackedOperationQueries, void, GetOperationsQueryResult> {
  async execute(): Promise<GetOperationsQueryResult> {
    const operations = await this.queriesService.findAll();
    return Result.ok(operations);
  }
}
