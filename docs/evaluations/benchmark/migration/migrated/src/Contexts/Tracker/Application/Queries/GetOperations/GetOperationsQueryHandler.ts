import { IResult, NotAllowedException, Result } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';

import { IOperationRecords } from '@Contexts/Tracker/Application/Ports/IOperationRecords';
import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';

type Filters = { traceId?: string };

/** Listing every operation is an administrator's view. */
export class GetOperationsQueryHandler extends QueryHandler<IOperationRecords, Filters, IResult<OperationRecord[]>> {
  protected async guard(_: Filters, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (auth.role !== Role.ADMIN) {
      return Result.fail(new NotAllowedException('Tracker', 'Only an administrator can list operations'));
    }
    return Result.ok();
  }

  async execute(filters: Filters): Promise<IResult<OperationRecord[]>> {
    const records = filters?.traceId ? await this.queries.findByTraceId(filters.traceId) : await this.queries.findAll();

    return Result.ok(records);
  }
}
