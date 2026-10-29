"""The application service, with the in-memory repository as the double and a fake channel that
says whether it is available, accepts or refuses, and remembers what it received."""

from typing import Any

from architecture.application.execution_context import ExecutionContext
from architecture.application.operation import Operation
from architecture.domain.common_exceptions import UnknownException
from architecture.domain.event import Event
from architecture.domain.result import Failure, Result, Success
from architecture.infrastructure.data_sources import InMemoryDataSource
from contexts.notifications.application.delivery import NotificationDelivery
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.dtos import NewNotification, NotificationSnapshot
from contexts.notifications.domain.notification.events import NotificationFailedEvent, NotificationSentEvent
from contexts.notifications.domain.notification.notification_status import NotificationStatus
from contexts.notifications.domain.notification.ports.notification_channel import Delivery
from contexts.notifications.infrastructure.repositories import InMemoryNotificationRepository


class FakeChannel:
    def __init__(self, channel: Channel, available: bool = True, accepts: bool = True) -> None:
        self.channel = channel
        self.delivered: list[Delivery] = []
        self._available = available
        self._accepts = accepts

    async def is_available_for(self, recipient_id: str) -> bool:
        return self._available

    async def deliver(self, delivery: Delivery) -> Result[None]:
        self.delivered.append(delivery)
        return Success(None) if self._accepts else Failure(UnknownException(f"{self.channel.value} refused"))


class RecordingBus:
    def __init__(self) -> None:
        self.published: list[Event] = []

    async def connect(self) -> None: ...

    def publish[E: Event](self, event: E, context: ExecutionContext, message_id: str | None = None) -> Operation[E]:
        self.published.append(event)
        return Operation(event, context)

    async def dispatch(self, operation: Operation[Any]) -> Operation[Any]:
        return operation

    async def subscribe(self, channel: str, handler: object) -> None: ...


class Fixture:
    def __init__(self, *channels: FakeChannel) -> None:
        self.store: InMemoryDataSource[NotificationSnapshot] = InMemoryDataSource()
        self.bus = RecordingBus()
        self.delivery = NotificationDelivery(InMemoryNotificationRepository(self.store), channels)
        self.context = ExecutionContext(trace_id="trace", event_bus=self.bus)

    def saved(self, notification_id: str) -> NotificationSnapshot:
        return self.store.collection[notification_id]


to_bob = NewNotification(
    recipient_id="bob", title="Hello", content="World", channels=[Channel.WEBSOCKET, Channel.EMAIL]
)


async def test_delivers_through_the_first_available_channel_and_stops_there() -> None:
    websocket, email = FakeChannel(Channel.WEBSOCKET), FakeChannel(Channel.EMAIL)
    fixture = Fixture(websocket, email)

    result = await fixture.delivery.deliver(to_bob, fixture.context)

    assert isinstance(result, Success)
    assert len(websocket.delivered) == 1 and email.delivered == []
    saved = fixture.saved(result.data)
    assert (saved.status, saved.delivered_via) == (NotificationStatus.SENT, Channel.WEBSOCKET)
    assert [(a.channel, a.succeeded) for a in saved.attempts] == [(Channel.WEBSOCKET, True)]
    assert fixture.bus.published == [
        NotificationSentEvent(notification_id=result.data, recipient_id="bob", via=Channel.WEBSOCKET)
    ]


async def test_falls_back_to_the_next_channel_when_the_first_is_unavailable() -> None:
    websocket, email = FakeChannel(Channel.WEBSOCKET, available=False), FakeChannel(Channel.EMAIL)
    fixture = Fixture(websocket, email)

    result = await fixture.delivery.deliver(to_bob, fixture.context)

    assert isinstance(result, Success)
    assert websocket.delivered == [] and len(email.delivered) == 1
    saved = fixture.saved(result.data)
    assert (saved.status, saved.delivered_via) == (NotificationStatus.SENT, Channel.EMAIL)
    assert [(a.channel, a.succeeded) for a in saved.attempts] == [(Channel.WEBSOCKET, False), (Channel.EMAIL, True)]


async def test_fails_the_notification_keeping_every_attempt_when_no_channel_accepts_it() -> None:
    fixture = Fixture(FakeChannel(Channel.WEBSOCKET, accepts=False), FakeChannel(Channel.EMAIL, accepts=False))

    result = await fixture.delivery.deliver(to_bob, fixture.context)

    assert isinstance(result, Success)  # the delivery ran; the notification records the failure
    saved = fixture.saved(result.data)
    assert saved.status is NotificationStatus.FAILED and len(saved.attempts) == 2
    assert fixture.bus.published == [NotificationFailedEvent(notification_id=result.data, recipient_id="bob")]


async def test_treats_a_channel_with_no_adapter_as_unavailable() -> None:
    fixture = Fixture(FakeChannel(Channel.EMAIL))
    result = await fixture.delivery.deliver(to_bob, fixture.context)
    assert isinstance(result, Success) and fixture.saved(result.data).delivered_via is Channel.EMAIL


async def test_refuses_an_invalid_notification_before_touching_any_channel() -> None:
    websocket = FakeChannel(Channel.WEBSOCKET)
    fixture = Fixture(websocket)

    blank = NewNotification(recipient_id="bob", title="  ", content="World", channels=[Channel.WEBSOCKET])
    result = await fixture.delivery.deliver(blank, fixture.context)

    assert isinstance(result, Failure)
    assert websocket.delivered == [] and fixture.store.collection == {}
