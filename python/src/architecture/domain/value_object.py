"""ValueObject: an object defined by its value, with no identity of its own.

Two value objects are equal when they are of the same kind and their values are equal. They
are immutable: to "change" one you create another. Their job is to make an invalid value
impossible to represent, so validation lives in the value object, in ``create()``, instead of
being sprinkled across the code.

A value object is a frozen dataclass over one field, ``value``: the dataclass gives it the
structural equality and the hash, and the frozen flag the immutability. The kind matters
(``__eq__`` is the dataclass's, which refuses another class), so an ``Id`` and a ``NoteTitle``
holding the same string are not equal.

Examples: architecture/domain/id.py, shared_kernel/domain/email.py,
contexts/notes/domain/note/note_title.py.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ValueObject[T]:
    value: T
