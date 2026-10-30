"""The ways a notification can reach someone. One infrastructure adapter per value (NotificationChannel)."""

from enum import StrEnum


class Channel(StrEnum):
    WEBSOCKET = "WEBSOCKET"
    EMAIL = "EMAIL"


def is_channel(name: str) -> bool:
    """A name a client sent is a channel only if the domain knows it; the domain decides, not the request model."""
    return name in Channel.__members__.values()
