"""The ways a notification can reach someone. One infrastructure adapter per value (NotificationChannel)."""

from enum import StrEnum


class Channel(StrEnum):
    WEBSOCKET = "WEBSOCKET"
    EMAIL = "EMAIL"
