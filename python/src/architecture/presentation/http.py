"""What every route does with a command, a refusal and the request's context."""

from typing import Any

from fastapi.encoders import jsonable_encoder
from starlette.requests import Request
from starlette.responses import JSONResponse

from architecture.application.execution_context import ExecutionContext
from architecture.domain.common_exceptions import NotAllowedException, NotFoundException
from architecture.domain.event import CommandEvent
from architecture.domain.exception import DomainException


def accept(context: ExecutionContext, command: CommandEvent) -> JSONResponse:
    """Accepts a command: the operation exists, its id is answered with ``202``, and its dispatch
    runs after the response has left, with this request's context. The handling itself is the
    handlers' business."""
    operation = context.event_bus.publish(command, context)
    return JSONResponse({"operationId": operation.id}, status_code=202)


def status_of(error: DomainException) -> int:
    """The status a refusal's kind deserves when the context has no more specific answer."""
    if isinstance(error, NotAllowedException):
        return 403
    if isinstance(error, NotFoundException):
        return 404
    return 400


def refuse(error: DomainException, status: int | None = None) -> JSONResponse:
    """``{ message }`` with the status that says why."""
    return JSONResponse({"message": error.message}, status_code=status or status_of(error))


def context_of(request: Request) -> ExecutionContext:
    """The per-request context the composition root's middleware built."""
    context = request.state.execution_context
    if not isinstance(context, ExecutionContext):
        raise RuntimeError("No execution context on the request: the bootstrap's middleware is missing")
    return context


def jsonable(value: Any) -> Any:
    """A read model, a dataclass, a datetime, an enum, as JSON data."""
    return jsonable_encoder(value)
