"""DomainException describes a broken rule: which context refused (``service``), which rule
(``type``, a stable identifier a client can switch on), in words (``message``), with what
details (``context``). It is a plain value carried by ``Failure``, never raised, so it does not
extend ``BaseException``: there is no stack to capture for an expected outcome (ADR 1). It is
named ``DomainException`` because ``Exception`` is Python's own, the one that *is* raised.

Each context declares its own subclasses next to its aggregate
(contexts/notes/domain/note/note_exceptions.py); the generic ones (NotFound, NotAllowed,
ConcurrencyConflict, Unknown) live in common_exceptions.py.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class DomainException:
    service: str
    type: str
    message: str
    context: dict[str, Any] = field(default_factory=dict)
