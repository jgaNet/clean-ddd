"""The one authorization question every context asks first: is there a signed-in user or
administrator behind this call? It answers with the caller's Id, so a handler can hand it to the
aggregate. Whether that caller may touch a given object is the aggregate's business.

Call it once, at the top of ``execute()``, naming your context so the refusal says where it
came from: the handler needs the Id anyway, and a ``guard()`` override that asked the same
question would only ask it twice. Reserve ``guard()`` for rules that need no caller Id, such as
"administrators only".
"""

from architecture.application.execution_context import ExecutionContext
from architecture.domain.common_exceptions import NotAllowedException
from architecture.domain.id import Id
from architecture.domain.result import Failure, Result, Success
from shared_kernel.domain.role import Role


def require_signed_in(context: ExecutionContext, service: str) -> Result[Id]:
    subject_id = context.auth.subject_id
    if not subject_id or Role.parse(context.auth.role) not in (Role.ADMIN, Role.USER):
        return Failure(NotAllowedException(service, "Authentication required"))
    return Success(Id(subject_id))
