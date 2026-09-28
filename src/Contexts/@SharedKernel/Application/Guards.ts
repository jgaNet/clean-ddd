import { IResult, NotAllowedException, Result, Role } from '@SharedKernel/Domain';
import { Id } from '@SharedKernel/Domain/Utils';

import { ExecutionContext } from '@SharedKernel/Application/ExecutionContext';

/**
 * The one authorization question every context asks first: is there a signed-in user or
 * administrator behind this call? It answers with the caller's Id, so a handler can hand
 * it to the aggregate. Whether that caller may touch a given object is the aggregate's business.
 */
export function requireSignedIn({ auth }: ExecutionContext, service = 'Auth'): IResult<Id> {
  if (!auth.subjectId || !auth.role || ![Role.ADMIN, Role.USER].includes(auth.role)) {
    return Result.fail(new NotAllowedException(service, 'Authentication required'));
  }
  return Result.ok(new Id(auth.subjectId));
}
