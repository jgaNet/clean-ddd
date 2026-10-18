//! The REST routes of the Notes context, and their controller: one function per route. Commands
//! are accepted (202) and processed through the event bus; the client follows the returned
//! operation. Queries answer synchronously. The verb follows what the request does to what the
//! URL names (the HTTP grammar of the contract): `POST /notes` creates, `PUT /notes/{id}`
//! replaces, `POST /notes/{id}/share` acts, `GET` reads.
//!
//! The JSON shapes are this layer's: a request body is deserialized into what the command
//! needs, a read model is serialized through a view, so the Domain never learns about JSON.
//! `GET /notes/new` is the one HTMX answer of the context: the form the front end swaps in.

use std::sync::Arc;

use architecture_application::{ExecutionContext, Module};
use architecture_domain::Exception;
use architecture_presentation::{accept, refused, status_of};
use axum::Router;
use axum::extract::{Extension, Path, State};
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Json, Response};
use axum::routing::{get, post};
use notes_application::commands::archive_note::ArchiveNote;
use notes_application::commands::create_note::CreateNote;
use notes_application::commands::edit_note::EditNote;
use notes_application::commands::restore_note::RestoreNote;
use notes_application::commands::share_note::ShareNote;
use notes_application::commands::suggest_note_title::SuggestNoteTitle;
use notes_application::queries::get_my_notes::GetMyNotes;
use notes_application::queries::get_note::GetNote;
use notes_application::queries::get_notes_shared_with_me::GetNotesSharedWithMe;
use notes_domain::note::note_exceptions::NOTE_NOT_FOUND;
use notes_domain::note::ports::note_queries::{NoteDetail, NoteListItem, SharedNoteListItem};
use serde::{Deserialize, Serialize};

/// `/notes`: the caller's notes, the ones shared with them, one note, and the commands on one.
pub fn note_routes(module: Arc<Module>) -> Router {
    Router::new()
        .route("/", post(create_note).get(get_my_notes))
        .route("/shared", get(get_notes_shared_with_me))
        .route("/new", get(new_note))
        .route("/{id}", get(get_note).put(edit_note))
        .route("/{id}/archive", post(archive_note))
        .route("/{id}/restore", post(restore_note))
        .route("/{id}/share", post(share_note))
        .route("/{id}/suggest-title", post(suggest_note_title))
        .with_state(module)
}

#[derive(Debug, Deserialize)]
struct CreateNoteBody {
    title: String,
    content: String,
}

// The same shape today, its own body on purpose: what one command accepts must not leak into the other.
#[derive(Debug, Deserialize)]
struct EditNoteBody {
    title: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareNoteBody {
    recipient_id: String,
}

#[derive(Debug, Serialize)]
struct NoteListItemView {
    id: String,
    title: String,
    status: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteDetailView {
    id: String,
    title: String,
    status: &'static str,
    owner_id: String,
    content: String,
    shared_with: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SharedNoteListItemView {
    id: String,
    title: String,
    content: String,
    owner_id: String,
}

impl From<NoteListItem> for NoteListItemView {
    fn from(note: NoteListItem) -> Self {
        Self { id: note.id, title: note.title, status: note.status.as_str() }
    }
}

impl From<NoteDetail> for NoteDetailView {
    fn from(note: NoteDetail) -> Self {
        Self {
            id: note.id,
            title: note.title,
            status: note.status.as_str(),
            owner_id: note.owner_id,
            content: note.content,
            shared_with: note.shared_with,
        }
    }
}

impl From<SharedNoteListItem> for SharedNoteListItemView {
    fn from(note: SharedNoteListItem) -> Self {
        Self { id: note.id, title: note.title, content: note.content, owner_id: note.owner_id }
    }
}

async fn create_note(Extension(context): Extension<ExecutionContext>, Json(body): Json<CreateNoteBody>) -> Response {
    accept(&context, CreateNote { title: body.title, content: body.content }).into_response()
}

async fn edit_note(
    Extension(context): Extension<ExecutionContext>,
    Path(id): Path<String>,
    Json(body): Json<EditNoteBody>,
) -> Response {
    accept(&context, EditNote { note_id: id, title: body.title, content: body.content }).into_response()
}

async fn archive_note(Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    accept(&context, ArchiveNote { note_id: id }).into_response()
}

async fn restore_note(Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    accept(&context, RestoreNote { note_id: id }).into_response()
}

async fn share_note(
    Extension(context): Extension<ExecutionContext>,
    Path(id): Path<String>,
    Json(body): Json<ShareNoteBody>,
) -> Response {
    accept(&context, ShareNote { note_id: id, recipient_id: body.recipient_id }).into_response()
}

async fn suggest_note_title(Extension(context): Extension<ExecutionContext>, Path(id): Path<String>) -> Response {
    accept(&context, SuggestNoteTitle { note_id: id }).into_response()
}

/// The form the HTMX front end swaps in to write a note; it posts to the same `POST /notes`.
async fn new_note() -> Response {
    Html(
        r##"<form hx-post="/v1/notes" hx-ext="json-enc" hx-swap="none" hx-on::after-request="if(event.detail.successful) this.reset()">
  <h2>Create a new Note</h2>
  <p>
    <label for="title">Title</label>
    <br />
    <input type="text" name="title" id="title" />
  </p>
  <p>
    <label for="content">Body</label>
    <br />
    <textarea rows="5" cols="50" name="content" id="content"></textarea>
  </p>
  <input type="submit" value="Submit" />
</form>"##,
    )
    .into_response()
}

async fn get_my_notes(State(module): State<Arc<Module>>, Extension(context): Extension<ExecutionContext>) -> Response {
    match module.query::<GetMyNotes>().handle(GetMyNotes, &context).await {
        Ok(notes) => Json(notes.into_iter().map(NoteListItemView::from).collect::<Vec<_>>()).into_response(),
        Err(error) => refuse(error),
    }
}

async fn get_note(
    State(module): State<Arc<Module>>,
    Extension(context): Extension<ExecutionContext>,
    Path(id): Path<String>,
) -> Response {
    match module.query::<GetNote>().handle(GetNote { note_id: id }, &context).await {
        Ok(note) => Json(NoteDetailView::from(note)).into_response(),
        Err(error) => refuse(error),
    }
}

async fn get_notes_shared_with_me(
    State(module): State<Arc<Module>>,
    Extension(context): Extension<ExecutionContext>,
) -> Response {
    match module.query::<GetNotesSharedWithMe>().handle(GetNotesSharedWithMe, &context).await {
        Ok(notes) => Json(notes.into_iter().map(SharedNoteListItemView::from).collect::<Vec<_>>()).into_response(),
        Err(error) => refuse(error),
    }
}

/// The context's own kinds first (a note that is not found is a 404), the common ones after.
fn refuse(error: Exception) -> Response {
    let status = if error.is(NOTE_NOT_FOUND) { StatusCode::NOT_FOUND } else { status_of(&error) };
    refused(status, &error)
}
