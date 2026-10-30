"""The Application layer's building blocks: what every use case is written with, whatever the
context. The base handlers (a command, a query, a reaction), the execution context that travels
with one request, the operation a published event becomes, the event bus port, the module that
lists a context's handlers as data, and the two functions that make an aggregate's events, and a fact told to
other contexts, durable in the outbox and published once the transaction is committed.

A module is imported by its path (``from architecture.application.command_handler import
CommandHandler``); this file re-exports the names a use case uses most.
"""

from architecture.application.command_handler import CommandHandler
from architecture.application.domain_events import publish_domain_events, publish_integration_event
from architecture.application.event_bus import EventBus, Subscriber
from architecture.application.event_handler import EventHandler
from architecture.application.execution_context import Auth, ExecutionContext, Logger, UnitOfWork
from architecture.application.module import Module, Subscription
from architecture.application.operation import Operation, OperationStatus
from architecture.application.outbox import Outbox, OutboxEntry, relay_outbox
from architecture.application.query_handler import QueryHandler

__all__ = [
    "Auth",
    "CommandHandler",
    "EventBus",
    "EventHandler",
    "ExecutionContext",
    "Logger",
    "Module",
    "Operation",
    "OperationStatus",
    "Outbox",
    "OutboxEntry",
    "QueryHandler",
    "Subscriber",
    "Subscription",
    "UnitOfWork",
    "publish_domain_events",
    "publish_integration_event",
    "relay_outbox",
]
