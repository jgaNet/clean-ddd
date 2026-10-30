"""Makes every domain event an aggregate recorded durable with the state it describes, and lets
the context publish it after the commit (ADR 3, ADR 24). The events are pulled from the
aggregate at commit time, not before: what is stored is everything the aggregate recorded
during the transaction, and a rollback leaves the aggregate's events where they are,
unpublished, to be discarded with it. Extracting and storing the events are one step, taken
only when the facts are about to be durable; publishing them is the relay's, once they are.

Command handlers call it through ``self.publish_domain_events()``; application services and
reactions call it directly. A reaction tells other contexts a fact the same way, with
``publish_integration_event()`` (ADR 30): appended to the outbox when the reaction's own
transaction commits, relayed after it, under the entry's id. A context without a unit of work
(a handler's unit test) has no outbox: there the events go straight to the bus once the use case
has succeeded, as ``after_commit`` promises.
"""

from collections.abc import Callable, Sequence

from architecture.application.execution_context import ExecutionContext
from architecture.domain.aggregate_root import AggregateRoot
from architecture.domain.event import Event, IntegrationEvent


def publish_domain_events(aggregate: AggregateRoot, context: ExecutionContext) -> None:
    _durable(aggregate.pull_domain_events, context)


def publish_integration_event(event: IntegrationEvent, context: ExecutionContext) -> None:
    """Tells other contexts a fact the way a domain event is told (ADR 30): appended to the outbox
    when the reaction's transaction commits, relayed after it, under the entry's id. The reaction
    that translates a domain event into the published contract calls it; nothing publishes an
    integration event straight to the bus, where a rollback could not take it back."""
    _durable(lambda: [event], context)


def _durable(events: Callable[[], Sequence[Event]], context: ExecutionContext) -> None:
    """At commit, the events are appended to the outbox; without a unit of work, they are published
    once the use case has succeeded."""
    unit_of_work = context.unit_of_work
    if unit_of_work is None:

        def publish() -> None:
            for event in events():
                context.event_bus.publish(event, context)

        context.after_commit(publish)
        return

    outbox = unit_of_work.outbox

    def store() -> None:
        outbox.append(events())

    context.before_commit(store)
