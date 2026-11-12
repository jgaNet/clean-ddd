"""An application's now (DOMAIN-ONE-CLOCK, ADR 42): a function the wiring builds once and passes to
whatever decides or records a time — a handler, a job, an adapter, the bus — which hands
``clock()`` to the domain as a parameter. A domain method's time parameter has no default, so a
forgotten call fails the type check instead of deciding on another now. The system clock is in
the building blocks' infrastructure (``architecture.infrastructure.clock``); a test passes a fixed
one (``lambda: at``)."""

from collections.abc import Callable
from datetime import datetime

type Clock = Callable[[], datetime]
