import { IResult, NotFoundException, Result } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

import { IOperationRecords } from '@Contexts/Tracker/Application/Ports/IOperationRecords';
import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';

/**
 * A user may follow their own operations; an administrator may follow any. An operation nobody
 * started — an anonymous command, a sign-up — is followed by whoever holds its id: the id is
 * unguessable and is only ever given to the caller who started it, in the 202 (ADR 27).
 */
export class GetOperationQueryHandler extends QueryHandler<
  IOperationRecords,
  { id: string },
  IResult<OperationRecord>
> {
  async execute({ id }: { id: string }, context: ExecutionContext): Promise<IResult<OperationRecord>> {
    const record = await this.queries.findById(id);
    if (record && !record.subjectId) return Result.ok(record);

    const reader = requireSignedIn(context, 'Tracker');
    if (reader.isFailure()) return reader;

    // An operation someone else started does not exist, as far as you know.
    const visible = record && (context.auth.role === Role.ADMIN || record.subjectId === reader.data.value);
    if (!visible) return Result.fail(new NotFoundException('Tracker', 'Operation not found', { id }));

    return Result.ok(record);
  }
}
