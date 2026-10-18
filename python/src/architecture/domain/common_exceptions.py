"""The refusals every context may have to say, with the types a controller maps to a status:
not found (404), not allowed (403), a concurrency conflict and anything unknown (400)."""

from typing import Any

from architecture.domain.exception import DomainException


def _service_or_unknown(service: str) -> str:
    return service or "unknown"


class UnknownException(DomainException):
    """A failure nobody expected (a stray exception turned into a failed operation by the base handler)."""

    def __init__(self, message: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(service="unknown", type="Unknown", message=message, context=context or {})


class NotFoundException(DomainException):
    def __init__(self, service: str, message: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(service=_service_or_unknown(service), type="NotFound", message=message, context=context or {})


class NotAllowedException(DomainException):
    def __init__(self, service: str, message: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(
            service=_service_or_unknown(service), type="NotAllowed", message=message, context=context or {}
        )


class ConcurrencyConflictException(DomainException):
    """The aggregate changed since it was read: the caller re-reads and decides again (ADR 8)."""

    def __init__(self, service: str, message: str, context: dict[str, Any] | None = None) -> None:
        super().__init__(
            service=_service_or_unknown(service), type="ConcurrencyConflict", message=message, context=context or {}
        )
