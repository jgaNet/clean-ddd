//! Domain exceptions describe a broken business rule, in business words.
//!
//! They are values carried by a failed `DomainResult`, never panicked: a refused command is a
//! normal outcome, not a crash. Each one names the rule it protects, as a `kind` constant a
//! test or a controller can ask for (`error.is(NOT_NOTE_OWNER)`), and a function that builds it
//! with its details. One rule the user could act on differently, one kind.

use architecture_domain::Exception;

/// The context that refuses.
pub const SERVICE: &str = "Notes";

pub const BLANK_NOTE_TITLE: &str = "BlankNoteTitle";
pub const NOTE_TITLE_TOO_LONG: &str = "NoteTitleTooLong";
pub const NOTE_NOT_FOUND: &str = "NoteNotFound";
pub const NOT_NOTE_OWNER: &str = "NotNoteOwner";
pub const NOTE_ARCHIVED: &str = "NoteArchived";
pub const NOTE_ALREADY_ARCHIVED: &str = "NoteAlreadyArchived";
pub const NOTE_NOT_ARCHIVED: &str = "NoteNotArchived";
pub const CANNOT_SHARE_WITH_SELF: &str = "CannotShareWithSelf";
pub const NOTE_ALREADY_SHARED: &str = "NoteAlreadyShared";
pub const RECIPIENT_NOT_FOUND: &str = "RecipientNotFound";

fn refusal(kind: &str, message: &str) -> Exception {
    Exception::new(SERVICE, kind, message)
}

pub fn blank_note_title() -> Exception {
    refusal(BLANK_NOTE_TITLE, "A note needs a title")
}

pub fn note_title_too_long(max_length: usize, actual_length: usize) -> Exception {
    refusal(NOTE_TITLE_TOO_LONG, &format!("A note title cannot exceed {max_length} characters"))
        .with("maxLength", max_length)
        .with("actualLength", actual_length)
}

pub fn note_not_found(note_id: &str) -> Exception {
    refusal(NOTE_NOT_FOUND, "Note not found").with("noteId", note_id)
}

pub fn not_note_owner(note_id: &str, actor_id: &str) -> Exception {
    refusal(NOT_NOTE_OWNER, "Only the owner of a note can change it").with("noteId", note_id).with("actorId", actor_id)
}

pub fn note_archived(note_id: &str) -> Exception {
    refusal(NOTE_ARCHIVED, "An archived note is read-only; restore it first").with("noteId", note_id)
}

pub fn note_already_archived(note_id: &str) -> Exception {
    refusal(NOTE_ALREADY_ARCHIVED, "This note is already archived").with("noteId", note_id)
}

pub fn note_not_archived(note_id: &str) -> Exception {
    refusal(NOTE_NOT_ARCHIVED, "Only an archived note can be restored").with("noteId", note_id)
}

pub fn cannot_share_with_self(note_id: &str) -> Exception {
    refusal(CANNOT_SHARE_WITH_SELF, "You already own this note").with("noteId", note_id)
}

pub fn note_already_shared(note_id: &str, recipient_id: &str) -> Exception {
    refusal(NOTE_ALREADY_SHARED, "This note is already shared with that account")
        .with("noteId", note_id)
        .with("recipientId", recipient_id)
}

pub fn recipient_not_found(note_id: &str, recipient_id: &str) -> Exception {
    refusal(RECIPIENT_NOT_FOUND, "There is no account to share this note with")
        .with("noteId", note_id)
        .with("recipientId", recipient_id)
}
