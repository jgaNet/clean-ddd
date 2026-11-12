"""The machine's time, read here and nowhere else (DOMAIN-ONE-CLOCK, ADR 42): the wiring passes
``system_clock`` to what needs a now. An application that moves time (a demo, a test server, an
offset) builds another clock in its wiring and passes that one instead."""

from datetime import UTC, datetime


def system_clock() -> datetime:
    """Now, in UTC: the application's clock when nothing moves time."""
    return datetime.now(UTC)
