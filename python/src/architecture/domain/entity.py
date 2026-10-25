"""Entity: an object defined by its identity, not by its attributes.

Two entities of the same kind with the same id are the same thing even if their fields differ;
two with different ids are different things even if every field matches. That is what
``equals()`` expresses. The kind matters: an Account and a Note that happened to share an id
would not be the same thing. The id is immutable for the whole life of the object.

Most of the time you will extend AggregateRoot rather than Entity directly: the root is the
entity through which the rest of its aggregate is reached.

Its state stays in private attributes (``self._title``), reached through properties, and that
is the encapsulation the whole design rests on. An entity defines no ``__eq__``: comparing two
with ``==`` compares identity of the Python object, which is never what a test means. Compare
them with ``equals()`` (are they the same thing?) or through ``to_snapshot()`` (do they hold
the same state?).

Example: contexts/notes/domain/note/note.py
"""

from architecture.domain.id import Id


class Entity:
    __slots__ = ("_id",)

    def __init__(self, id: Id) -> None:
        self._id = id

    @property
    def id(self) -> Id:
        return self._id

    def equals(self, other: "Entity") -> bool:
        """The same thing? Identity and kind decide, whatever the attributes now say."""
        return type(self) is type(other) and self._id == other._id
