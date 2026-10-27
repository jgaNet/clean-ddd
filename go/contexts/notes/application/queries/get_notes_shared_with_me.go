package queries

import (
	"clean-ddd/architecture/application"
	"clean-ddd/contexts/notes/domain/note"
	kernel "clean-ddd/sharedkernel/application"
)

type GetNotesSharedWithMeHandler struct {
	queries note.Queries
}

func NewGetNotesSharedWithMeHandler(queries note.Queries) *GetNotesSharedWithMeHandler {
	return &GetNotesSharedWithMeHandler{queries: queries}
}

func (h *GetNotesSharedWithMeHandler) Execute(_ application.NoParams, ctx *application.ExecutionContext) ([]note.SharedListItem, error) {
	me, err := kernel.RequireSignedIn(ctx, note.Service)
	if err != nil {
		return nil, err
	}
	return h.queries.FindSharedWith(me.Value())
}
