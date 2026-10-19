"""Live delivery to a connected browser. The channel owns the sockets; what is written on the
wire is decided by the ``render`` function the wiring hands in (an HTMX presenter here), so this
adapter knows nothing about markup. ``routes()`` is the ``/ws`` endpoint the composition root
mounts at the root: a connection is accepted for a signed-in caller (the authentication
middleware identified them, as for any request) and kept until the browser leaves."""

from collections.abc import Callable

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from architecture.application.execution_context import Auth, Logger
from architecture.domain.common_exceptions import UnknownException
from architecture.domain.result import Failure, Result, Success
from contexts.notifications.domain.notification.channel import Channel
from contexts.notifications.domain.notification.ports.notification_channel import Delivery
from shared_kernel.domain.role import Role


class WebSocketChannel:
    channel = Channel.WEBSOCKET

    def __init__(self, logger: Logger | None, render: Callable[[Delivery], str]) -> None:
        self._logger = logger
        self._render = render
        self._clients: dict[str, set[WebSocket]] = {}

    def routes(self) -> APIRouter:
        router = APIRouter()

        @router.websocket("/ws")
        async def connect(websocket: WebSocket) -> None:
            auth = getattr(websocket.state, "auth", None)
            if not isinstance(auth, Auth) or not auth.subject_id or Role.parse(auth.role) in (None, Role.GUEST):
                await websocket.close()
                return
            await self._accept(websocket, auth.subject_id)

        return router

    async def is_available_for(self, recipient_id: str) -> bool:
        return bool(self._open_sockets(recipient_id))

    async def deliver(self, delivery: Delivery) -> Result[None]:
        sockets = self._open_sockets(delivery.recipient_id)
        if not sockets:
            return Failure(UnknownException(f"No open connection for {delivery.recipient_id}"))
        message = self._render(delivery)
        for socket in sockets:
            await socket.send_text(message)
        return Success(None)

    def _open_sockets(self, recipient_id: str) -> list[WebSocket]:
        return [s for s in self._clients.get(recipient_id, ()) if s.client_state is WebSocketState.CONNECTED]

    async def _accept(self, websocket: WebSocket, subject_id: str) -> None:
        await websocket.accept()
        self._clients.setdefault(subject_id, set()).add(websocket)
        if self._logger:
            self._logger.info(f"User {subject_id} connected to WebSocket")
        try:
            while True:
                await websocket.receive_text()  # the browser sends nothing; this waits for it to leave
        except WebSocketDisconnect:
            pass
        finally:
            sockets = self._clients.get(subject_id)
            if sockets is not None:
                sockets.discard(websocket)
                if not sockets:
                    del self._clients[subject_id]
            if self._logger:
                self._logger.info(f"User {subject_id} disconnected from WebSocket")
