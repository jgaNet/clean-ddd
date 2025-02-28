import { GetOperationQueryResult, GetOperationQueryPayload } from '@Shared/Application/DTOs';
import { NotFoundException, QueryHandler, Result } from '@Primitives';
import { IOperationQueries } from '@Shared/Domain/Operation/Ports/IOperationQueries';

export class GetOperationHandler extends QueryHandler<
  IOperationQueries,
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
