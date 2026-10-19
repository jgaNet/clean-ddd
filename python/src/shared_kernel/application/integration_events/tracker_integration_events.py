"""Published by the Tracker's bus decorator when a command of an authenticated caller reaches
its outcome: one notice per command, once there is something to say."""

from dataclasses import dataclass
from typing import Any

from architecture.domain.event import IntegrationEvent


@dataclass(frozen=True)
class OperationCompleteIntegrationEvent(IntegrationEvent):
    operation_id: str
    user_id: str
    status: str
    type: str
    result: Any = None
    error: str | None = None
