import { IResult, NotAllowedException, NotFoundException, Result, Role } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@SharedKernel/Application';

import { IOperationRecords } from '@Contexts/Tracker/Application/Ports/IOperationRecords';
import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';

/** A user may follow their own operations; an administrator may follow any. */
export class GetOperationHandler extends QueryHandler<IOperationRecords, { id: string }, IResult<OperationRecord>> {
  protected async guard({ id }: { id: string }, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (auth.role === Role.ADMIN) return Result.ok();

    const record = await this.queriesService.findById(id);
    if (auth.role === Role.USER && record?.subjectId === auth.subjectId) return Result.ok();

    return Result.fail(new NotAllowedException('Tracker', 'Forbidden'));
  }

  async execute({ id }: { id: string }): Promise<IResult<OperationRecord>> {
    const record = await this.queriesService.findById(id);
    if (!record) return Result.fail(new NotFoundException('Tracker', 'Operation not found', { id }));

    return Result.ok(record);
  }
}
