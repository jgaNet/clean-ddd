"""Result is how an operation says whether it worked. An expected failure (a refused command, an
invalid value) is a value the caller must look at, not an exception it may forget to catch
(ADR 1).

Write ``Result[T]`` in signatures and build one with ``Success(data)`` / ``Failure(error)``::

    @staticmethod
    def create(props: NewNote) -> Result[Note]:
        title = NoteTitle.create(props.title)
        if isinstance(title, Failure):
            return title                      # a failure is returned as is, whatever T
        return Success(Note(...))

``isinstance(result, Failure)`` narrows the type: after ``if isinstance(r, Failure): return r``
the type checker knows ``r.data`` is a T. ``Result[None]`` is what a behaviour that answers
nothing returns; ``Success(None)`` is its "ok".
"""

from dataclasses import dataclass
from typing import Literal

from architecture.domain.exception import DomainException


@dataclass(frozen=True, slots=True)
class Success[T]:
    data: T

    def is_success(self) -> Literal[True]:
        return True

    def is_failure(self) -> Literal[False]:
        return False


@dataclass(frozen=True, slots=True)
class Failure:
    error: DomainException

    def is_success(self) -> Literal[False]:
        return False

    def is_failure(self) -> Literal[True]:
        return True


type Result[T] = Success[T] | Failure
