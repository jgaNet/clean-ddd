"""The REST routes of the Notes context. Commands are accepted (202) and processed through the
event bus; the client follows the returned operation. Queries answer synchronously, through
a view of the read model, or are refused with the status the refusal deserves: the context maps
its own kinds first (``NoteNotFound`` is a 404) and falls back on ``status_of()``.

The verb follows the HTTP grammar (``yarn architecture verbs``): ``POST /notes`` creates,
``PUT /notes/{id}`` replaces, ``POST /notes/{id}/share`` acts; an action undone is a second act
named after the undoing (``/archive`` and ``/restore``), never a ``DELETE``.
"""

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel
from starlette.responses import JSONResponse, Response

from architecture.application.module import Module
from architecture.domain.exception import DomainException
from architecture.domain.result import Failure
from architecture.presentation.http import accept, context_of, refuse, status_of
from contexts.notes.application.commands.archive_note import ArchiveNoteCommandEvent
from contexts.notes.application.commands.create_note import CreateNoteCommandEvent
from contexts.notes.application.commands.edit_note import EditNoteCommandEvent
from contexts.notes.application.commands.restore_note import RestoreNoteCommandEvent
from contexts.notes.application.commands.share_note import ShareNoteCommandEvent
from contexts.notes.application.commands.suggest_note_title import SuggestNoteTitleCommandEvent
from contexts.notes.application.queries.get_my_notes import GetMyNotesQueryHandler
from contexts.notes.application.queries.get_note import GetNoteQueryHandler
from contexts.notes.application.queries.get_notes_shared_with_me import GetNotesSharedWithMeQueryHandler
from contexts.notes.domain.note.note_exceptions import NoteNotFoundException
from contexts.notes.domain.note.ports.note_queries import NoteDetail, NoteListItem, SharedNoteListItem
from contexts.notes.presentation.presenters import NewNoteHtmxPresenter


class CreateNoteBody(BaseModel):
    title: str
    content: str


# The same shape today, its own schema on purpose: what one command accepts must not leak into the other.
class EditNoteBody(BaseModel):
    title: str
    content: str


class ShareNoteBody(BaseModel):
    recipientId: str  # noqa: N815


def list_item_view(note: NoteListItem) -> dict[str, Any]:
    return {"id": note.id, "title": note.title, "status": note.status.value}


def detail_view(note: NoteDetail) -> dict[str, Any]:
    return {
        "id": note.id,
        "title": note.title,
        "status": note.status.value,
        "ownerId": note.owner_id,
        "content": note.content,
        "sharedWith": list(note.shared_with),
    }


def shared_item_view(note: SharedNoteListItem) -> dict[str, Any]:
    return {"id": note.id, "title": note.title, "content": note.content, "ownerId": note.owner_id}


def refuse_note(error: DomainException) -> JSONResponse:
    return refuse(error, 404 if isinstance(error, NoteNotFoundException) else status_of(error))


def note_routes(module: Module) -> APIRouter:
    router = APIRouter(prefix="/notes", tags=["notes"])
    new_note_form = NewNoteHtmxPresenter()

    @router.post("", status_code=202)
    async def create_note(request: Request, body: CreateNoteBody) -> Response:
        return accept(context_of(request), CreateNoteCommandEvent(title=body.title, content=body.content))

    @router.get("")
    async def get_my_notes(request: Request) -> Response:
        context = context_of(request)
        result = await module.get_query(GetMyNotesQueryHandler).handle(None, context)
        if isinstance(result, Failure):
            return refuse_note(result.error)
        return JSONResponse([list_item_view(note) for note in result.data])

    @router.get("/shared")
    async def get_notes_shared_with_me(request: Request) -> Response:
        context = context_of(request)
        result = await module.get_query(GetNotesSharedWithMeQueryHandler).handle(None, context)
        if isinstance(result, Failure):
            return refuse_note(result.error)
        return JSONResponse([shared_item_view(note) for note in result.data])

    @router.get("/new")
    async def new_note() -> Response:
        return new_note_form.present()

    @router.get("/{note_id}")
    async def get_note(request: Request, note_id: str) -> Response:
        context = context_of(request)
        result = await module.get_query(GetNoteQueryHandler).handle(note_id, context)
        if isinstance(result, Failure):
            return refuse_note(result.error)
        return JSONResponse(detail_view(result.data))

    @router.put("/{note_id}", status_code=202)
    async def edit_note(request: Request, note_id: str, body: EditNoteBody) -> Response:
        command = EditNoteCommandEvent(note_id=note_id, title=body.title, content=body.content)
        return accept(context_of(request), command)

    @router.post("/{note_id}/archive", status_code=202)
    async def archive_note(request: Request, note_id: str) -> Response:
        return accept(context_of(request), ArchiveNoteCommandEvent(note_id=note_id))

    @router.post("/{note_id}/restore", status_code=202)
    async def restore_note(request: Request, note_id: str) -> Response:
        return accept(context_of(request), RestoreNoteCommandEvent(note_id=note_id))

    @router.post("/{note_id}/share", status_code=202)
    async def share_note(request: Request, note_id: str, body: ShareNoteBody) -> Response:
        return accept(context_of(request), ShareNoteCommandEvent(note_id=note_id, recipient_id=body.recipientId))

    @router.post("/{note_id}/suggest-title", status_code=202)
    async def suggest_note_title(request: Request, note_id: str) -> Response:
        return accept(context_of(request), SuggestNoteTitleCommandEvent(note_id=note_id))

    return router
