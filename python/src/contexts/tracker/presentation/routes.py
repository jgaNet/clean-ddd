"""Read-only: the Tracker has no commands."""

from typing import Any

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse, Response

from architecture.application.module import Module
from architecture.domain.result import Failure
from architecture.presentation.http import context_of, jsonable, refuse
from contexts.tracker.application.queries.get_operation import GetOperationQueryHandler
from contexts.tracker.application.queries.get_operations import GetOperationsQueryHandler, OperationFilters
from contexts.tracker.application.read_model import OperationRecord


def operation_view(record: OperationRecord) -> dict[str, Any]:
    """The record in client words: camelCase, and nothing for what is not there yet."""
    view = {
        "id": record.id,
        "name": record.name,
        "status": record.status.value,
        "traceId": record.trace_id,
        "subjectId": record.subject_id,
        "result": jsonable(record.result),
        "error": {"type": record.error.type, "message": record.error.message} if record.error else None,
        "createdAt": record.created_at.isoformat(),
        "finishedAt": record.finished_at.isoformat() if record.finished_at else None,
    }
    return {key: value for key, value in view.items() if value is not None}


def operation_routes(module: Module) -> APIRouter:
    router = APIRouter(prefix="/tracker/operations", tags=["tracker"])

    @router.get("")
    async def get_operations(request: Request, traceId: str | None = None) -> Response:  # noqa: N803
        context = context_of(request)
        result = await module.get_query(GetOperationsQueryHandler).handle(OperationFilters(trace_id=traceId), context)
        if isinstance(result, Failure):
            return refuse(result.error)
        return JSONResponse([operation_view(record) for record in result.data])

    @router.get("/{operation_id}")
    async def get_operation(request: Request, operation_id: str) -> Response:
        context = context_of(request)
        result = await module.get_query(GetOperationQueryHandler).handle(operation_id, context)
        if isinstance(result, Failure):
            return refuse(result.error)
        return JSONResponse(operation_view(result.data))

    return router
