package queries

import (
	"clean-ddd/architecture/application"
	"clean-ddd/contexts/notes/domain/note"
	kernel "clean-ddd/sharedkernel/application"
)

type GetMyNotesHandler struct {
	queries note.Queries
}

func NewGetMyNotesHandler(queries note.Queries) *GetMyNotesHandler {
	return &GetMyNotesHandler{queries: queries}
}

func (h *GetMyNotesHandler) Execute(_ application.NoParams, ctx *application.ExecutionContext) ([]note.ListItem, error) {
	owner, err := kernel.RequireSignedIn(ctx, note.Service)
	if err != nil {
		return nil, err
	}
	return h.queries.FindByOwner(owner.Value())
}
