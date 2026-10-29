"""Makes every domain event an aggregate recorded durable with the state it describes, and lets
the context publish it after the commit (ADR 3, ADR 24). The events are pulled from the
aggregate at commit time, not before: what is stored is everything the aggregate recorded
during the transaction, and a rollback leaves the aggregate's events where they are,
unpublished, to be discarded with it. Extracting and storing the events are one step, taken
only when the facts are about to be durable; publishing them is the relay's, once they are.

Command handlers call it through ``self.publish_domain_events()``; application services call it
directly. A context without a unit of work (a handler's unit test) has no outbox: there the
events go straight to the bus once the use case has succeeded, as ``after_commit`` promises.
Outside any transaction (a reaction, after the command that set it off committed) the events
are stored and relayed at once (see ExecutionContext.before_commit).
"""

from architecture.application.execution_context import ExecutionContext
from architecture.domain.aggregate_root import AggregateRoot


def publish_domain_events(aggregate: AggregateRoot, context: ExecutionContext) -> None:
    unit_of_work = context.unit_of_work
    if unit_of_work is None:

        def publish() -> None:
            for event in aggregate.pull_domain_events():
                context.event_bus.publish(event, context)

        context.after_commit(publish)
        return

    outbox = unit_of_work.outbox

    def store() -> None:
        outbox.append(aggregate.pull_domain_events())

    context.before_commit(store)
