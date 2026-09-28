import { ExecutionContext, IResult, Result, NotAllowedException } from '@SharedKernel/Domain/Application';
import { Role } from '@SharedKernel/Domain/AccessControl';
import { Id } from '@SharedKernel/Domain/Utils';

/**
 * Every Notes use case is reserved to a signed-in user or admin. This answers "who is
 * calling?" once; whether that caller may touch a given note is the aggregate's business.
 */
export function requireSignedIn({ auth }: ExecutionContext): IResult<Id> {
  if (!auth.subjectId || !auth.role || ![Role.ADMIN, Role.USER].includes(auth.role)) {
    return Result.fail(new NotAllowedException('Notes', 'Authentication required'));
  }
  return Result.ok(new Id(auth.subjectId));
}
