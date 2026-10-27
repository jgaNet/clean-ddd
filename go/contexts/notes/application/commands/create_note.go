package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notes/domain/note"
	kernel "clean-ddd/sharedkernel/application"
)

type CreateNoteCommandEvent struct {
	domain.CommandEvent
	Title   string
	Content string
}

type CreateNoteHandler struct {
	notes note.Repository
}

func NewCreateNoteHandler(notes note.Repository) *CreateNoteHandler {
	return &CreateNoteHandler{notes: notes}
}

// Execute answers with the id of the note it created: the operation's result.
func (h *CreateNoteHandler) Execute(command CreateNoteCommandEvent, ctx *application.ExecutionContext) (string, error) {
	owner, err := kernel.RequireSignedIn(ctx, note.Service)
	if err != nil {
		return "", err
	}
	n, err := note.Create(note.NewNote{OwnerID: owner.Value(), Title: command.Title, Content: command.Content})
	if err != nil {
		return "", err
	}
	if err := h.notes.Save(n); err != nil {
		return "", err
	}
	application.PublishDomainEvents(n, ctx)
	return n.ID().Value(), nil
}
