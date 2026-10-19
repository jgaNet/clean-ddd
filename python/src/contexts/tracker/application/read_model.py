"""Tracker has no aggregate. It is a projection: every operation the event bus carries is
recorded as one of these, so a client that received ``202 { operationId }`` can come back and
ask how it went. A read model, shaped for that question and nothing else.

No payload: a command may carry a secret (the password at sign-up), and a client who holds the
operation id already knows what it asked for. Status, result and error are what the record is for.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from architecture.application.operation import OperationStatus


@dataclass(frozen=True)
class OperationError:
    type: str
    message: str


@dataclass(frozen=True)
class OperationRecord:
    id: str
    #: The command or event name, e.g. "CreateNoteCommandEvent".
    name: str
    status: OperationStatus
    trace_id: str
    created_at: datetime
    #: The account that asked, when the request was authenticated.
    subject_id: str | None = None
    #: What the handler returned on success.
    result: Any = None
    error: OperationError | None = None
    finished_at: datetime | None = None
