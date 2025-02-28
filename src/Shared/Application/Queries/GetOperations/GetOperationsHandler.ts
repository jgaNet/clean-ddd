import { GetOperationsQueryResult } from '@Shared/Application/DTOs';
import { QueryHandler, Result } from '@Primitives';
import { IOperationQueries } from '@Shared/Domain/Operation/Ports/IOperationQueries';

export class GetOperationsHandler extends QueryHandler<IOperationQueries, void, GetOperationsQueryResult> {
  async execute(): Promise<GetOperationsQueryResult> {
    const operations = await this.queriesService.findAll();
    return Result.ok(operations);
  }
}
