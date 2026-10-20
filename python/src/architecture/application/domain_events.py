"""Sends every domain event an aggregate recorded, once the surrounding transaction has
committed. The events are pulled from the aggregate at that moment, not before: what goes out
is everything the aggregate recorded during the transaction, and a rollback leaves the
aggregate's events where they are, unpublished, to be discarded with it. Extracting and
acknowledging the events are one step, taken only when the facts are durable (ADR 3).

Command handlers call it through ``self.publish_domain_events()``; application services call it
directly. Outside any transaction the callback runs at once (see ExecutionContext.after_commit).
"""

from architecture.application.execution_context import ExecutionContext
from architecture.domain.aggregate_root import AggregateRoot


def publish_domain_events(aggregate: AggregateRoot, context: ExecutionContext) -> None:
    def publish() -> None:
        for event in aggregate.pull_domain_events():
            context.event_bus.publish(event, context)

    context.after_commit(publish)
