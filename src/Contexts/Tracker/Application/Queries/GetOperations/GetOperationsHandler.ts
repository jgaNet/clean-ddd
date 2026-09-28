import { IResult, NotAllowedException, Result, Role } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@SharedKernel/Application';

import { IOperationRecords } from '@Contexts/Tracker/Application/Ports/IOperationRecords';
import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';

type Filters = { traceId?: string };

/** Listing every operation is an administrator's view. */
export class GetOperationsHandler extends QueryHandler<IOperationRecords, Filters, IResult<OperationRecord[]>> {
  protected async guard(_: Filters, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (auth.role !== Role.ADMIN) {
      return Result.fail(new NotAllowedException('Tracker', 'Forbidden'));
    }
    return Result.ok();
  }

  async execute(filters: Filters): Promise<IResult<OperationRecord[]>> {
    const records = filters?.traceId
      ? await this.queriesService.findByTraceId(filters.traceId)
      : await this.queriesService.findAll();

    return Result.ok(records);
  }
}
