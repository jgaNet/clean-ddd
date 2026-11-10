"""What every route does with a command, a refusal and the request's context.

Who reaches a command is the transport's to say, at once (API-CALLER-AT-TRANSPORT, ADR 39). A route
whose command's outcome is read later answers with ``accept()`` and nothing else: it publishes the
command and answers ``202 { operationId }``, or, when nobody is signed in and the command's handler
does not say anyone may ask for it (``anyone_may_ask()``), answers ``401`` and publishes nothing.
The client learns at once that it must sign in, instead of following an operation that was never
going to succeed. The conventions check refuses a route that publishes a command any other way.

What a signed-in caller may do is not decided here: the handler still asks for its caller's id, and
the aggregate still refuses what that caller may not do, on the operation. A command answered at
once (a login) does not come through here and keeps its own refusal::

    @router.post("/{note_id}/archive", status_code=202)
    async def archive_note(request: Request, note_id: str) -> Response:
        return accept(module, context_of(request), ArchiveNoteCommandEvent(note_id=note_id))
"""

from typing import Any

from fastapi.encoders import jsonable_encoder
from starlette.requests import Request
from starlette.responses import JSONResponse

from architecture.application.command_handler import CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.module import Module
from architecture.domain.common_exceptions import NotAllowedException, NotFoundException
from architecture.domain.event import CommandEvent, name_of
from architecture.domain.exception import DomainException

#: The message of a ``401``, the same on every route.
AUTHENTICATION_REQUIRED = "Authentication required"


def accept(module: Module, context: ExecutionContext, command: CommandEvent) -> JSONResponse:
    """Accepts a command: the operation exists, its id is answered with ``202``, and its dispatch
    runs after the response has left, with this request's context; or, to a caller who is not
    signed in, ``401 { message }`` and nothing published, unless the handler the module lists for
    the command says anyone may ask for it. The handling itself is the handlers' business."""
    if not signed_in(context) and not anyone_may_ask(module, command):
        return JSONResponse({"message": AUTHENTICATION_REQUIRED}, status_code=401)
    operation = context.event_bus.publish(command, context)
    return JSONResponse({"operationId": operation.id}, status_code=202)


def not_allowed_status(context: ExecutionContext) -> int:
    """The status of a ``NotAllowedException`` a query answers at once: ``401`` to a caller who is
    not signed in, as HTTP says for missing credentials, ``403`` to a signed-in caller the rule
    refuses. One refusal has one status, for a command and a query alike."""
    return 403 if signed_in(context) else 401


def status_of(error: DomainException, context: ExecutionContext) -> int:
    """The status a refusal's kind deserves when the context has no more specific answer."""
    if isinstance(error, NotAllowedException):
        return not_allowed_status(context)
    if isinstance(error, NotFoundException):
        return 404
    return 400


def refuse(error: DomainException, context: ExecutionContext, status: int | None = None) -> JSONResponse:
    """``{ message }`` with the status that says why."""
    return JSONResponse({"message": error.message}, status_code=status or status_of(error, context))


def context_of(request: Request) -> ExecutionContext:
    """The per-request context the composition root's middleware built."""
    context = request.state.execution_context
    if not isinstance(context, ExecutionContext):
        raise RuntimeError("No execution context on the request: the bootstrap's middleware is missing")
    return context


def jsonable(value: Any) -> Any:
    """A read model, a dataclass, a datetime, an enum, as JSON data."""
    return jsonable_encoder(value)


def signed_in(context: ExecutionContext) -> bool:
    return bool(context.auth.subject_id)


def anyone_may_ask(module: Module, command: CommandEvent) -> bool:
    """What the handler the module lists for this command says; a command no handler of the module
    answers is a wiring error, not a refusal."""
    handlers = [
        handler
        for subscription in module.commands
        if isinstance(command, subscription.event)
        for handler in subscription.handlers
        if isinstance(handler, CommandHandler)
    ]
    if not handlers:
        raise LookupError(f"No handler for {name_of(command)} in module {module.name}: list it in the context's wiring")
    return all(handler.anyone_may_ask(command) for handler in handlers)
