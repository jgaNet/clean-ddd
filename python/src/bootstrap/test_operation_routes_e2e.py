"""The Tracker routes, end to end: following an operation."""

from bootstrap.testing import start_test_application


async def test_following_an_operation() -> None:
    app = await start_test_application()
    api = app.api
    admin = await app.admin()

    # Sharing a note that does not exist is refused by the domain: a command that leaves no
    # trace in Notes, but a full one in Tracker.
    accepted = await admin.post(f"{api}/notes/00000000-0000-4000-8000-000000000000/share", json={"recipientId": "bob"})
    assert accepted.status_code == 202
    trace_id = accepted.headers["x-trace-id"]
    operation_id = accepted.json()["operationId"]

    # Recorded up to its outcome, in client words, without the execution context
    operation = await app.operation(admin, operation_id)
    assert operation == {
        "id": operation_id,
        "name": "ShareNote",
        "status": "ERROR",
        "traceId": trace_id,
        "subjectId": operation["subjectId"],
        "error": {"type": "NoteNotFound", "message": "Note not found"},
        "createdAt": operation["createdAt"],
        "finishedAt": operation["finishedAt"],
    }
    assert isinstance(operation["subjectId"], str)

    # Listed for an administrator, by trace when asked
    by_trace = await admin.get(f"{api}/tracker/operations", params={"traceId": trace_id})
    assert by_trace.status_code == 200
    # The trace holds the command and everything it set off: here the notification telling the
    # caller how it went, whose own domain events are recorded too (never announced).
    records = by_trace.json()
    assert ("ShareNote", "ERROR") in [(r["name"], r["status"]) for r in records]
    assert "NotificationFailed" in [r["name"] for r in records]
    assert all(r["traceId"] == trace_id for r in records)

    # Not for a user, and not someone else's operation
    await app.sign_up_validated("bob@tracker.fr", "bob")
    bob = await app.agent_as("bob@tracker.fr", "bob")
    assert (await bob.get(f"{api}/tracker/operations")).status_code == 403
    assert (await bob.get(f"{api}/tracker/operations/{operation_id}")).status_code == 404

    await app.stop()


async def test_an_operation_nobody_started_is_shown_to_whoever_holds_its_id() -> None:
    app = await start_test_application()
    api = app.api
    anonymous = app.anonymous()

    # A sign-up is anonymous: the only one who knows its id is the caller it was answered to.
    signed_up = await anonymous.post(f"{api}/auth/signup", json={"identifier": "tracked@x.fr", "password": "secret"})
    operation = await app.accepted(anonymous, signed_up)
    assert (operation["name"], operation["status"]) == ("SignUp", "SUCCESS")
    assert isinstance(operation["result"], str)

    admin = await app.admin()
    accepted = await admin.post(f"{api}/notes/00000000-0000-4000-8000-000000000000/share", json={"recipientId": "bob"})
    # One an account started is that account's, and an administrator's: an anonymous caller is asked to sign in.
    stranger = await anonymous.get(f"{api}/tracker/operations/{accepted.json()['operationId']}")
    assert stranger.status_code == 403

    await app.stop()
