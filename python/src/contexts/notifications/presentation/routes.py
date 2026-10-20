"""The REST routes of the Notifications context: an inbox, a notification marked read (a
``PATCH``: part of its state changes), a notification sent by hand (administrators; the
authorization is the handler's guard)."""

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse, Response

from architecture.application.module import Module
from architecture.domain.exception import DomainException
from architecture.domain.result import Failure
from architecture.presentation.http import accept, context_of, jsonable, refuse, status_of
from contexts.notifications.application.commands.mark_as_read import MarkAsReadNotificationCommandEvent
from contexts.notifications.application.commands.send_notification import SendNotificationCommandEvent
from contexts.notifications.application.queries.get_notifications import GetNotificationsQueryHandler, InboxQuery
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.notification_exceptions import NotificationNotFoundException
from contexts.notifications.domain.notification.ports.notification_queries import InboxFilters, NotificationListItem


class SendNotificationBody(BaseModel):
    recipientId: str  # noqa: N815
    title: str
    content: str
    channels: list[Channel] = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


def list_item_view(n: NotificationListItem) -> dict[str, Any]:
    view = {
        "id": n.id,
        "recipientId": n.recipient_id,
        "title": n.title,
        "content": n.content,
        "status": n.status.value,
        "channels": [channel.value for channel in n.channels],
        "deliveredVia": n.delivered_via.value if n.delivered_via else None,
        "createdAt": n.created_at.isoformat(),
        "sentAt": n.sent_at.isoformat() if n.sent_at else None,
        "readAt": n.read_at.isoformat() if n.read_at else None,
        "metadata": jsonable(n.metadata),
    }
    return {key: value for key, value in view.items() if value is not None}


def refuse_notification(error: DomainException) -> JSONResponse:
    return refuse(error, 404 if isinstance(error, NotificationNotFoundException) else status_of(error))


def notification_routes(module: Module) -> APIRouter:
    router = APIRouter(prefix="/notifications", tags=["notifications"])

    @router.get("/account/{recipient_id}")
    async def get_account_notifications(
        request: Request,
        recipient_id: str,
        limit: int = 20,
        offset: int = 0,
        onlyUnread: bool = False,  # noqa: N803
    ) -> Response:
        context = context_of(request)
        query = InboxQuery(recipient_id, InboxFilters(limit=limit, offset=offset, only_unread=onlyUnread))
        result = await module.get_query(GetNotificationsQueryHandler).handle(query, context)
        if isinstance(result, Failure):
            return refuse_notification(result.error)
        inbox = result.data
        return JSONResponse(
            {
                "notifications": [list_item_view(n) for n in inbox.notifications],
                "total": inbox.total,
                "unread": inbox.unread,
            }
        )

    @router.patch("/{notification_id}/read", status_code=202)
    async def mark_as_read(request: Request, notification_id: str) -> Response:
        return accept(context_of(request), MarkAsReadNotificationCommandEvent(notification_id=notification_id))

    @router.post("", status_code=202)
    async def send_notification(request: Request, body: SendNotificationBody) -> Response:
        command = SendNotificationCommandEvent(
            recipient_id=body.recipientId,
            title=body.title,
            content=body.content,
            channels=body.channels,
            metadata=body.metadata,
        )
        return accept(context_of(request), command)

    return router
