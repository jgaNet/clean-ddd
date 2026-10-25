"""The projection itself: from what the bus knows about an operation to what a client may see.
It keeps the trace and the caller, drops the execution context (logger, bus, unit of work have
no place in a read model) and the payload (it may carry a secret), and flattens the Result into
``result`` / ``error``."""

from typing import Any

from architecture.application.operation import Operation
from architecture.domain.event import public_name_of
from architecture.domain.result import Failure, Success
from contexts.tracker.application.read_model import OperationError, OperationRecord


def to_operation_record(operation: Operation[Any]) -> OperationRecord:
    result = operation.result
    return OperationRecord(
        id=operation.id,
        name=public_name_of(operation.event),
        status=operation.status,
        trace_id=operation.context.trace_id,
        subject_id=operation.context.auth.subject_id or None,
        result=result.data if isinstance(result, Success) else None,
        error=OperationError(result.error.type, result.error.message) if isinstance(result, Failure) else None,
        created_at=operation.created_at,
        finished_at=operation.finished_at,
    )
