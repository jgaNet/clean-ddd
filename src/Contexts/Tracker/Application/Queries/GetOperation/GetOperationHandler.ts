import { NotFoundException, QueryHandler, Result } from '@SharedKernel/Domain/Application';
import { GetOperationQueryResult, GetOperationQueryPayload } from '@Contexts/Tracker/Application/DTOs';
import { ITrackedOperationQueries } from '@Contexts/Tracker/Domain/TrackedOperation/Ports/ITrackedOperationQueries';

export class GetOperationHandler extends QueryHandler<
  ITrackedOperationQueries,
  GetOperationQueryPayload,
  GetOperationQueryResult
> {
  async execute(payload: GetOperationQueryPayload): Promise<GetOperationQueryResult> {
    const operation = await this.queriesService.findById(payload.id);

    if (!operation) {
      return Result.fail(new NotFoundException('Operation', 'Operation not found', { id: payload.id }));
    }

    return Result.ok(operation);
  }
}
