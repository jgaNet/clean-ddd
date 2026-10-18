"""Id is the identity of an entity. The domain generates it itself (``Id.generate()``) when it
creates an aggregate, so a persistence round-trip is never needed to know who a new object is,
and the repository stays a plain load/save port (ADR 2)."""

from dataclasses import dataclass
from uuid import uuid4

from architecture.domain.value_object import ValueObject


@dataclass(frozen=True, slots=True)
class Id(ValueObject[str]):
    @staticmethod
    def generate() -> "Id":
        return Id(str(uuid4()))
