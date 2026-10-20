"""The Notifications routes, end to end: an inbox, and the live channel over the websocket."""

import asyncio
import json

import websockets

from bootstrap.testing import start_test_application


async def test_an_inbox_lists_what_was_delivered_marks_read_once_and_stays_private() -> None:
    app = await start_test_application()
    api = app.api
    admin = await app.admin()

    # Carol's sign-up and validation each produce one email notification for her.
    carol_id = await app.sign_up_validated("carol@notes.fr", "carol")
    carol = await app.agent_as("carol@notes.fr", "carol")

    inbox = await carol.get(f"{api}/notifications/account/{carol_id}")
    assert inbox.status_code == 200
    body = inbox.json()
    assert (body["total"], body["unread"]) == (2, 2)
    assert [(n["status"], n["deliveredVia"]) for n in body["notifications"]] == [("SENT", "EMAIL")] * 2
    assert "attempts" not in body["notifications"][0]
    first = body["notifications"][0]

    # The recipient marks one read, once
    accepted = await carol.patch(f"{api}/notifications/{first['id']}/read")
    assert (await app.accepted(carol, accepted))["status"] == "SUCCESS"
    # (her own command also produced one outcome notice, undelivered without a websocket: FAILED, not unread)
    after = (await carol.get(f"{api}/notifications/account/{carol_id}")).json()
    assert after["unread"] == 1
    read = next(n for n in after["notifications"] if n["id"] == first["id"])
    assert read["status"] == "READ" and isinstance(read["readAt"], str)
    again = await app.accepted(carol, await carol.patch(f"{api}/notifications/{first['id']}/read"))
    assert again["status"] == "ERROR" and again["error"]["type"] == "NotificationAlreadyRead"

    # An administrator may read any inbox; another user may not
    assert (await admin.get(f"{api}/notifications/account/{carol_id}")).status_code == 200
    await app.sign_up_validated("dave@notes.fr", "dave")
    dave = await app.agent_as("dave@notes.fr", "dave")
    assert (await dave.get(f"{api}/notifications/account/{carol_id}")).status_code == 403

    # Sending by hand is an administrator's; the refusal is the guard's, on the operation
    sent = await dave.post(
        f"{api}/notifications",
        json={"recipientId": carol_id, "title": "Hi", "content": "there", "channels": ["EMAIL"]},
    )
    assert (await app.accepted(dave, sent))["error"]["type"] == "NotAllowed"

    await app.stop()


async def test_a_connected_browser_is_told_live_how_its_commands_went() -> None:
    app = await start_test_application()
    api = app.api
    admin = await app.admin()
    token = (await app.login("admin@admin.fr", "admin")).json()["token"]
    ws_url = api.replace("http://", "ws://").removesuffix("/v1") + f"/ws?token={token}"

    async with websockets.connect(ws_url) as socket:
        created = await admin.post(f"{api}/notes", json={"title": "Live", "content": "wire"})
        assert created.status_code == 202
        frame = await asyncio.wait_for(socket.recv(), timeout=5)
        assert 'id="notifications"' in str(frame) and "succeeded" in str(frame)

        # A notification sent by hand over the websocket reaches the connected recipient at once
        admin_id = (await admin.get(f"{api}/auth/me")).json()["id"]
        sent = await admin.post(
            f"{api}/notifications",
            json={"recipientId": admin_id, "title": "Hello", "content": "<b>live</b>", "channels": ["WEBSOCKET"]},
        )
        frames = [str(await asyncio.wait_for(socket.recv(), timeout=5)) for _ in range(2)]
        assert any("<b>live</b>" in frame for frame in frames)
        operation = await app.accepted(admin, sent)
        assert operation["status"] == "SUCCESS"
        delivered = (await admin.get(f"{api}/notifications/account/{admin_id}")).json()["notifications"]
        assert any(n["title"] == "Hello" and n["deliveredVia"] == "WEBSOCKET" for n in delivered)

    # An anonymous connection is closed at once
    anonymous = api.replace("http://", "ws://").removesuffix("/v1") + "/ws"
    try:
        async with websockets.connect(anonymous) as socket:
            await asyncio.wait_for(socket.recv(), timeout=5)
            raise AssertionError("an anonymous connection must be closed")
    except (websockets.exceptions.ConnectionClosed, websockets.exceptions.InvalidStatus):
        pass

    assert json.loads((await admin.get(f"{api}/health")).text)["status"] == "ok"
    await app.stop()
