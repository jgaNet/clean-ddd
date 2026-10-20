from datetime import UTC, datetime

from architecture.domain.id import Id
from architecture.domain.result import Failure, Success
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.delivery_strategy import DeliveryStrategy
from contexts.notifications.domain.notification.dtos import NewNotification
from contexts.notifications.domain.notification.events import (
    NotificationFailedEvent,
    NotificationReadEvent,
    NotificationSentEvent,
)
from contexts.notifications.domain.notification.notification import Notification
from contexts.notifications.domain.notification.notification_status import NotificationStatus

bob, carol = Id("bob"), Id("carol")
at = datetime(2026, 1, 1, 10, tzinfo=UTC)
BOTH = [Channel.WEBSOCKET, Channel.EMAIL]


def status_of(notification: Notification) -> NotificationStatus:
    """Read through a function, so the type checker does not narrow the status between two asserts."""
    return notification.status


def a_notification(channels: list[Channel] | None = None) -> Notification:
    props = NewNotification(recipient_id="bob", title="Hello", content="World", channels=channels or list(BOTH))
    result = Notification.create(props, at)
    assert isinstance(result, Success)
    return result.data


class TestCreating:
    def test_starts_pending_with_every_channel_of_the_strategy_still_to_try(self) -> None:
        notification = a_notification()
        assert notification.status is NotificationStatus.PENDING
        assert notification.channels_to_try() == BOTH
        assert notification.attempts == [] and notification.pull_domain_events() == []

    def test_refuses_a_blank_title_and_an_empty_strategy(self) -> None:
        blank = Notification.create(
            NewNotification(recipient_id="bob", title=" ", content="x", channels=[Channel.EMAIL])
        )
        empty = Notification.create(NewNotification(recipient_id="bob", title="x", content="x", channels=[]))
        assert isinstance(blank, Failure) and blank.error.type == "BlankNotificationTitle"
        assert isinstance(empty, Failure) and empty.error.type == "EmptyDeliveryStrategy"


class TestDeliveryAttempts:
    def test_is_sent_by_the_first_channel_that_accepts_it_and_records_notification_sent(self) -> None:
        notification = a_notification()

        assert notification.record_attempt(Channel.WEBSOCKET, True, at).is_success()

        assert notification.status is NotificationStatus.SENT
        assert notification.delivered_via is Channel.WEBSOCKET
        assert notification.channels_to_try() == []
        assert [(a.channel, a.succeeded) for a in notification.attempts] == [(Channel.WEBSOCKET, True)]
        assert notification.pull_domain_events() == [
            NotificationSentEvent(notification_id=notification.id.value, recipient_id="bob", via=Channel.WEBSOCKET)
        ]

    def test_falls_back_to_the_next_channel_after_a_failure(self) -> None:
        notification = a_notification()

        notification.record_attempt(Channel.WEBSOCKET, False, at)
        assert status_of(notification) is NotificationStatus.PENDING
        assert notification.channels_to_try() == [Channel.EMAIL]

        notification.record_attempt(Channel.EMAIL, True, at)
        assert status_of(notification) is NotificationStatus.SENT
        assert notification.delivered_via is Channel.EMAIL
        assert len(notification.attempts) == 2

    def test_fails_once_every_channel_was_tried_and_records_notification_failed(self) -> None:
        notification = a_notification()
        notification.record_attempt(Channel.WEBSOCKET, False, at)
        notification.record_attempt(Channel.EMAIL, False, at)

        assert notification.status is NotificationStatus.FAILED
        assert notification.pull_domain_events() == [
            NotificationFailedEvent(notification_id=notification.id.value, recipient_id="bob")
        ]

    def test_never_tries_the_same_channel_twice_and_gives_each_attempt_its_own_identity(self) -> None:
        notification = a_notification()
        notification.record_attempt(Channel.WEBSOCKET, False, at)
        twice = notification.record_attempt(Channel.WEBSOCKET, True, at)
        assert isinstance(twice, Failure) and twice.error.type == "ChannelAlreadyTried"

        notification.record_attempt(Channel.EMAIL, False, at)
        first, second = notification.attempts
        assert not first.equals(second)


class TestReading:
    def test_is_marked_read_by_its_recipient_once_delivered_and_records_notification_read(self) -> None:
        notification = a_notification()
        notification.record_attempt(Channel.WEBSOCKET, True, at)
        notification.pull_domain_events()

        assert notification.mark_read(bob, at).is_success()
        assert notification.status is NotificationStatus.READ
        assert notification.pull_domain_events() == [
            NotificationReadEvent(notification_id=notification.id.value, recipient_id="bob")
        ]

    def test_is_reserved_to_the_recipient(self) -> None:
        notification = a_notification()
        notification.record_attempt(Channel.WEBSOCKET, True, at)
        refused = notification.mark_read(carol)
        assert isinstance(refused, Failure) and refused.error.type == "NotNotificationRecipient"

    def test_cannot_be_read_before_delivery_nor_twice(self) -> None:
        pending = a_notification()
        early = pending.mark_read(bob)
        assert isinstance(early, Failure) and early.error.type == "NotificationNotDelivered"

        read = a_notification()
        read.record_attempt(Channel.WEBSOCKET, True, at)
        read.mark_read(bob)
        again = read.mark_read(bob)
        assert isinstance(again, Failure) and again.error.type == "NotificationAlreadyRead"


def test_rebuilds_the_notification_and_its_attempts_from_a_snapshot_without_events() -> None:
    notification = a_notification()
    notification.record_attempt(Channel.WEBSOCKET, False, at)
    notification.record_attempt(Channel.EMAIL, True, at)
    notification.mark_read(bob, at)

    rebuilt = Notification.from_snapshot(notification.to_snapshot())

    assert rebuilt.equals(notification)
    assert rebuilt.to_snapshot() == notification.to_snapshot()
    assert [a.id for a in rebuilt.attempts] == [a.id for a in notification.attempts]
    assert rebuilt.pull_domain_events() == []


def test_a_strategy_drops_duplicate_channels_keeps_the_order_and_compares_by_value() -> None:
    strategy = DeliveryStrategy.create([Channel.EMAIL, Channel.WEBSOCKET, Channel.EMAIL])
    assert isinstance(strategy, Success) and strategy.data.channels == [Channel.EMAIL, Channel.WEBSOCKET]
    assert DeliveryStrategy.create(BOTH) == DeliveryStrategy.create(BOTH)
    assert DeliveryStrategy.create(BOTH) != DeliveryStrategy.create(list(reversed(BOTH)))
