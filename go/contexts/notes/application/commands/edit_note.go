package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notes/domain/note"
	kernel "clean-ddd/sharedkernel/application"
)

// EditNote is the shape every "change an existing note" use case follows: who is calling ->
// load the aggregate -> ask it to change -> save -> publish what it recorded. No rule of its
// own: everything that can be refused is refused by Note, and comes back as an error the
// handler returns as is.

type EditNoteCommandEvent struct {
	domain.CommandEvent
	NoteID  string
	Title   string
	Content string
}

type EditNoteHandler struct {
	notes note.Repository
}

func NewEditNoteHandler(notes note.Repository) *EditNoteHandler {
	return &EditNoteHandler{notes: notes}
}

func (h *EditNoteHandler) Execute(command EditNoteCommandEvent, ctx *application.ExecutionContext) (application.Nothing, error) {
	actor, err := kernel.RequireSignedIn(ctx, note.Service)
	if err != nil {
		return application.Nothing{}, err
	}
	n, err := h.notes.FindByID(command.NoteID)
	if err != nil {
		return application.Nothing{}, err
	}
	if n == nil {
		return application.Nothing{}, note.NoteNotFound(command.NoteID)
	}
	if err := n.Edit(actor, command.Title, command.Content); err != nil {
		return application.Nothing{}, err
	}
	if err := h.notes.Save(n); err != nil {
		return application.Nothing{}, err
	}
	application.PublishDomainEvents(n, ctx)
	return application.Nothing{}, nil
}
