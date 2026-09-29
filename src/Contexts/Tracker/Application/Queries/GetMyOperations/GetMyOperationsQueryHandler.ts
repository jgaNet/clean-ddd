import { IResult, Result } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@SharedKernel/Application';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

import { IOperationRecords, OperationFilters } from '@Contexts/Tracker/Application/Ports/IOperationRecords';
import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';

/**
 * A signed-in caller (user or administrator) lists the operations they started, most recent
 * first, narrowed to one status when asked. Whose records they are is decided here, by the
 * caller's own id; nobody sees another account's list. Every operation remains the
 * administrator's view, in GetOperationsQueryHandler.
 */
export class GetMyOperationsQueryHandler extends QueryHandler<
  IOperationRecords,
  OperationFilters,
  IResult<OperationRecord[]>
> {
  async execute(filters: OperationFilters, context: ExecutionContext): Promise<IResult<OperationRecord[]>> {
    const caller = requireSignedIn(context, 'Tracker');
    if (caller.isFailure()) return caller;

    return Result.ok(await this.queries.findBySubjectId(caller.data.value, filters));
  }
}
