import {
  NotFoundException,
  QueryHandler,
  Result,
  ExecutionContext,
  IResult,
  NotAllowedException,
} from '@SharedKernel/Domain/Application';
import { Role } from '@SharedKernel/Domain/AccessControl';
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
      return Result.fail(new NotFoundException('Tracker', 'Operation not found', { id: payload.id }));
    }

    return Result.ok(operation);
  }

  protected async guard(payload: GetOperationQueryPayload, { auth }: ExecutionContext): Promise<IResult> {
    if (auth.role === Role.ADMIN) {
      return Result.ok();
    }

    const operation = await this.queriesService.findById(payload.id);
    if (Role.USER === auth.role && operation?.context.auth.subjectId === auth.subjectId) {
      return Result.ok();
    }

    return Result.fail(new NotAllowedException('Tracker', 'Forbidden'));
  }
}
