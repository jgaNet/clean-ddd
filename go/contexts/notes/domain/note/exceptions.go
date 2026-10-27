package note

import "clean-ddd/architecture/domain"

// Domain exceptions describe a broken business rule, in business words. They are values
// returned as errors, never panicked: a refused command is a normal outcome, not a crash.
// Each one names the rule it protects, as a PascalCase Type a client reads on the operation.
// One rule the user could act on differently, one exception.

const Service = "Notes"

func exception(typ, message string, context map[string]any) *domain.Exception {
	return domain.NewException(Service, typ, message, context)
}

func BlankNoteTitle() *domain.Exception {
	return exception("BlankNoteTitle", "A note needs a title", nil)
}

func NoteTitleTooLong(maxLength, actualLength int) *domain.Exception {
	return exception("NoteTitleTooLong", "A note title cannot exceed 100 characters",
		map[string]any{"maxLength": maxLength, "actualLength": actualLength})
}

func NoteNotFound(noteID string) *domain.Exception {
	return exception("NoteNotFound", "Note not found", map[string]any{"noteId": noteID})
}

func NotNoteOwner(noteID, actorID string) *domain.Exception {
	return exception("NotNoteOwner", "Only the owner of a note can change it", map[string]any{"noteId": noteID, "actorId": actorID})
}

func NoteArchived(noteID string) *domain.Exception {
	return exception("NoteArchived", "An archived note is read-only; restore it first", map[string]any{"noteId": noteID})
}

func NoteAlreadyArchived(noteID string) *domain.Exception {
	return exception("NoteAlreadyArchived", "This note is already archived", map[string]any{"noteId": noteID})
}

func NoteNotArchived(noteID string) *domain.Exception {
	return exception("NoteNotArchived", "Only an archived note can be restored", map[string]any{"noteId": noteID})
}

func CannotShareWithSelf(noteID string) *domain.Exception {
	return exception("CannotShareWithSelf", "You already own this note", map[string]any{"noteId": noteID})
}

func NoteAlreadyShared(noteID, recipientID string) *domain.Exception {
	return exception("NoteAlreadyShared", "This note is already shared with that account",
		map[string]any{"noteId": noteID, "recipientId": recipientID})
}

func RecipientNotFound(noteID, recipientID string) *domain.Exception {
	return exception("RecipientNotFound", "There is no account to share this note with",
		map[string]any{"noteId": noteID, "recipientId": recipientID})
}
