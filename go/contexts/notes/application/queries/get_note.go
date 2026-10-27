package queries

import (
	"slices"

	"clean-ddd/architecture/application"
	"clean-ddd/contexts/notes/domain/note"
	kernel "clean-ddd/sharedkernel/application"
)

type GetNoteHandler struct {
	queries note.Queries
}

func NewGetNoteHandler(queries note.Queries) *GetNoteHandler {
	return &GetNoteHandler{queries: queries}
}

func (h *GetNoteHandler) Execute(noteID string, ctx *application.ExecutionContext) (note.Detail, error) {
	reader, err := kernel.RequireSignedIn(ctx, note.Service)
	if err != nil {
		return note.Detail{}, err
	}
	detail, err := h.queries.FindByID(noteID)
	if err != nil {
		return note.Detail{}, err
	}
	// A note someone else owns and did not share with you does not exist, as far as you know.
	me := reader.Value()
	if detail == nil || (detail.OwnerID != me && !slices.Contains(detail.SharedWith, me)) {
		return note.Detail{}, note.NoteNotFound(noteID)
	}
	return *detail, nil
}
