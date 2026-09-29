import { IResult, NotAllowedException, Result } from '@Architecture/Domain';
import { Role, isRole } from '@SharedKernel/Domain';
import { Id } from '@Architecture/Domain';

import { ExecutionContext } from '@Architecture/Application/ExecutionContext';

/**
 * The one authorization question every context asks first: is there a signed-in user or
 * administrator behind this call? It answers with the caller's Id, so a handler can hand
 * it to the aggregate. Whether that caller may touch a given object is the aggregate's business.
 *
 * Call it once, at the top of `execute()`, naming your context so the refusal says where it came from: the handler needs the Id anyway, and a `guard()`
 * override that asked the same question would only ask it twice. Reserve `guard()` for
 * rules that need no caller Id, such as "administrators only" (RegisterAdmin, SendNotification).
 */
export function requireSignedIn({ auth }: ExecutionContext, service: string): IResult<Id> {
  if (!auth.subjectId || !isRole(auth.role) || ![Role.ADMIN, Role.USER].includes(auth.role)) {
    return Result.fail(new NotAllowedException(service, 'Authentication required'));
  }
  return Result.ok(new Id(auth.subjectId));
}
