import { GetOperationsQueryResult } from '@Contexts/Operations/Application/DTOs';
import { QueryHandler, Result } from '@Primitives';
import { IOperationQueries } from '@Contexts/Operations/Domain/Operation/Ports/IOperationQueries';

export class GetOperationsHandler extends QueryHandler<IOperationQueries, void, GetOperationsQueryResult> {
  async execute(): Promise<GetOperationsQueryResult> {
    const operations = await this.queriesService.findAll();
    return Result.ok(operations);
  }
}
