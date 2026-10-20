from dataclasses import dataclass
from typing import Any

import pytest

from architecture.application.command_handler import CommandHandler
from architecture.application.execution_context import ExecutionContext
from architecture.application.module import Module, Subscription
from architecture.application.operation import Operation
from architecture.application.query_handler import QueryHandler
from architecture.domain.event import CommandEvent, Event
from architecture.domain.result import Result, Success


@dataclass(frozen=True)
class Greet(CommandEvent):
    name: str


class GreetHandler(CommandHandler[Greet]):
    async def execute(self, command: Greet, context: ExecutionContext) -> Result[None]:
        return Success(None)


@dataclass(frozen=True)
class Wave(CommandEvent):
    pass


class WaveHandler(CommandHandler[Wave]):
    async def execute(self, command: Wave, context: ExecutionContext) -> Result[None]:
        return Success(None)


class Counter:
    def count(self) -> int:
        return 3


class CountGreetings(QueryHandler[Counter, None, int]):
    async def execute(self, payload: None, context: ExecutionContext) -> Result[int]:
        return Success(self.queries.count())


greet = GreetHandler()
count = CountGreetings(Counter())
module = Module(
    name="Greetings",
    commands=[Subscription(Greet, [greet]), Subscription(Wave, [WaveHandler()])],
    queries=[count],
)


def test_finds_a_command_handler_by_its_class() -> None:
    assert module.get_command(GreetHandler) is greet


def test_finds_a_query_handler_by_its_class() -> None:
    assert module.get_query(CountGreetings) is count


def test_names_what_is_missing() -> None:
    class Bow(CommandHandler[Wave]):
        async def execute(self, command: Wave, context: ExecutionContext) -> Result[None]:
            return Success(None)

    with pytest.raises(LookupError, match="Missing command handler Bow in module Greetings"):
        module.get_command(Bow)


async def test_subscribes_every_handler_to_its_event_name() -> None:
    subscribed: list[str] = []

    class ListingBus:
        async def connect(self) -> None: ...

        def publish[E: Event](self, event: E, context: ExecutionContext) -> Operation[E]:
            raise AssertionError("not used")

        async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
            return operation

        async def subscribe(self, channel: str, handler: object) -> None:
            subscribed.append(channel)

    await module.subscribe(ListingBus())
    assert subscribed == ["Greet", "Wave"]
