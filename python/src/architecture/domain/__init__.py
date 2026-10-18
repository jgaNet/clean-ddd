"""The building blocks every domain is written with: identity, entities, aggregates, value
objects, events, results and exceptions. They know nothing of any context, and nothing of the
shared kernel either: the mechanics of the architecture, not its vocabulary.

A module is imported by its path (``from architecture.domain.result import Result``); this file
re-exports the names a domain uses most, the way the TypeScript barrel does.
"""

from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.common_exceptions import (
    ConcurrencyConflictException,
    NotAllowedException,
    NotFoundException,
    UnknownException,
)
from architecture.domain.entity import Entity
from architecture.domain.event import CommandEvent, DomainEvent, Event, IntegrationEvent
from architecture.domain.exception import DomainException
from architecture.domain.id import Id
from architecture.domain.result import Failure, Result, Success
from architecture.domain.value_object import ValueObject

__all__ = [
    "AggregateRoot",
    "CommandEvent",
    "ConcurrencyConflictException",
    "DomainEvent",
    "DomainException",
    "Entity",
    "Event",
    "Failure",
    "Id",
    "IntegrationEvent",
    "NotAllowedException",
    "NotFoundException",
    "Result",
    "Success",
    "UnknownException",
    "ValueObject",
]
