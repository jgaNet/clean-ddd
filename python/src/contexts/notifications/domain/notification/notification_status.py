"""PENDING until a channel accepts it, then SENT (and READ once the recipient opens it), or
FAILED when every channel of the strategy was tried. The Notification aggregate owns the
transitions."""

from enum import StrEnum


class NotificationStatus(StrEnum):
    PENDING = "PENDING"
    SENT = "SENT"
    READ = "READ"
    FAILED = "FAILED"
