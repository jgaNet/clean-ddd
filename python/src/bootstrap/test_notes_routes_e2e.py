"""The Notes routes, end to end: what a client sees. One application per case, shared by its
steps in order: each starts from what the earlier ones left. Write a step relative to that
state, or with a fresh account; never assume an empty store."""

from bootstrap.testing import start_test_application


async def test_notes_as_a_client_sees_them() -> None:
    app = await start_test_application()
    api = app.api
    admin = await app.admin()

    # GET /notes: nothing yet
    assert (await admin.get(f"{api}/notes")).json() == []

    # POST /notes: accepted, then listed, then read in full
    created = await admin.post(f"{api}/notes", json={"title": "title", "content": "content"})
    assert created.status_code == 202
    operation = await app.accepted(admin, created)
    assert operation["status"] == "SUCCESS"
    note_id = operation["result"]

    assert (await admin.get(f"{api}/notes")).json() == [{"id": note_id, "title": "title", "status": "ACTIVE"}]
    note = await admin.get(f"{api}/notes/{note_id}")
    assert note.status_code == 200
    assert note.json() == {
        "id": note_id,
        "title": "title",
        "status": "ACTIVE",
        "ownerId": note.json()["ownerId"],
        "content": "content",
        "sharedWith": [],
    }

    # PUT /notes/:id replaces its content
    edited = await admin.put(f"{api}/notes/{note_id}", json={"title": "edited", "content": "new content"})
    assert (await app.accepted(admin, edited))["status"] == "SUCCESS"
    assert (await admin.get(f"{api}/notes/{note_id}")).json()["title"] == "edited"

    # POST /notes/:id/archive, then /restore
    archived = await admin.post(f"{api}/notes/{note_id}/archive")
    assert archived.status_code == 202
    await app.accepted(admin, archived)
    assert (await admin.get(f"{api}/notes/{note_id}")).json()["status"] == "ARCHIVED"
    await app.accepted(admin, await admin.post(f"{api}/notes/{note_id}/restore"))
    assert (await admin.get(f"{api}/notes/{note_id}")).json()["status"] == "ACTIVE"

    # GET /notes/:id: unknown; anonymous: refused
    assert (await admin.get(f"{api}/notes/does-not-exist")).status_code == 404
    assert (await app.anonymous().get(f"{api}/notes")).status_code == 403

    await app.stop()


async def test_a_suggestion_enters_the_domain_as_a_value_the_note_may_refuse() -> None:
    app = await start_test_application()
    api = app.api
    admin = await app.admin()

    async def a_note(title: str, content: str) -> str:
        created = await admin.post(f"{api}/notes", json={"title": title, "content": content})
        note_id: str = (await app.accepted(admin, created))["result"]
        return note_id

    # Applied, with its provenance on the operation (ADR 7)
    note_id = await a_note("Untitled", "Groceries for Saturday\nmilk, eggs")
    accepted = await admin.post(f"{api}/notes/{note_id}/suggest-title")
    assert accepted.status_code == 202
    operation = await app.accepted(admin, accepted)
    assert operation["status"] == "SUCCESS"
    assert operation["result"]["title"] == "Groceries for Saturday"
    assert operation["result"]["provenance"]["source"] == "heuristic"
    assert operation["result"]["provenance"]["version"] == "first-line/1"
    assert isinstance(operation["result"]["provenance"]["at"], str)
    assert (await admin.get(f"{api}/notes/{note_id}")).json()["title"] == "Groceries for Saturday"

    # Refused by the note's rules: nothing changes
    note_id = await a_note("Long first line", f"{'x' * 120}\nsecond line")
    operation = await app.accepted(admin, await admin.post(f"{api}/notes/{note_id}/suggest-title"))
    assert operation["status"] == "ERROR" and operation["error"]["type"] == "NoteTitleTooLong"
    assert (await admin.get(f"{api}/notes/{note_id}")).json()["title"] == "Long first line"

    await app.stop()


async def test_sharing_a_note_lets_the_recipient_read_it_and_is_refused_for_an_unknown_account() -> None:
    app = await start_test_application()
    api = app.api
    admin = await app.admin()

    # A second, validated account: bob
    bob_id = await app.sign_up_validated("bob@notes.fr", "bob")

    # The admin writes a note and shares it with bob
    created = await admin.post(f"{api}/notes", json={"title": "Roadmap", "content": "Q4 plans"})
    note_id = (await app.accepted(admin, created))["result"]
    share = await admin.post(f"{api}/notes/{note_id}/share", json={"recipientId": bob_id})
    assert share.status_code == 202
    assert (await app.accepted(admin, share))["status"] == "SUCCESS"

    # Bob sees it among the notes shared with him, and may read it; carol may not
    bob = await app.agent_as("bob@notes.fr", "bob")
    shared = (await bob.get(f"{api}/notes/shared")).json()
    assert shared == [{"id": note_id, "title": "Roadmap", "content": "Q4 plans", "ownerId": shared[0]["ownerId"]}]
    assert (await bob.get(f"{api}/notes/{note_id}")).status_code == 200

    # And he was notified (next to the welcome notifications his account creation and validation produced)
    inbox = (await bob.get(f"{api}/notifications/account/{bob_id}")).json()
    shared_notice = next(n for n in inbox["notifications"] if n["title"] == "A note was shared with you: Roadmap")
    assert shared_notice["recipientId"] == bob_id
    assert shared_notice["metadata"]["noteId"] == note_id and shared_notice["metadata"]["source"] == "Notes.NoteShared"

    await app.sign_up_validated("carol@notes.fr", "carol")
    carol = await app.agent_as("carol@notes.fr", "carol")
    assert (await carol.get(f"{api}/notes/{note_id}")).status_code == 404

    # Sharing with an unknown account is refused by the domain, through the port to Security
    unknown = await admin.post(
        f"{api}/notes/{note_id}/share", json={"recipientId": "00000000-0000-4000-8000-000000000000"}
    )
    operation = await app.accepted(admin, unknown)
    assert operation["status"] == "ERROR" and operation["error"]["type"] == "RecipientNotFound"
    assert (await admin.get(f"{api}/notes/{note_id}")).json()["sharedWith"] == [bob_id]

    # The admin archives the note: bob, who it was shared with, is told it is no longer available
    archived = await admin.post(f"{api}/notes/{note_id}/archive")
    assert (await app.accepted(admin, archived))["status"] == "SUCCESS"
    inbox = (await bob.get(f"{api}/notifications/account/{bob_id}")).json()
    archived_notice = next(n for n in inbox["notifications"] if n["title"] == "A note is no longer available: Roadmap")
    assert archived_notice["recipientId"] == bob_id
    assert archived_notice["metadata"] == {
        "noteId": note_id,
        "archivedBy": shared[0]["ownerId"],
        "source": "Notes.NoteArchived",
    }

    await app.stop()
