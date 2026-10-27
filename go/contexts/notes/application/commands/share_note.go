package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notes/domain/note"
	kernel "clean-ddd/sharedkernel/application"
)

// ShareNote is the use case, and nothing but the use case: who is calling, load the aggregate,
// hand it to the domain service that holds the one rule the aggregate cannot check alone (the
// recipient exists), save, publish what was recorded. No rule of its own: everything that can
// be refused is refused by Sharing or by Note, and comes back as an error.

type ShareNoteCommandEvent struct {
	domain.CommandEvent
	NoteID      string
	RecipientID string
}

type ShareNoteHandler struct {
	notes   note.Repository
	sharing *note.Sharing
}

func NewShareNoteHandler(notes note.Repository, sharing *note.Sharing) *ShareNoteHandler {
	return &ShareNoteHandler{notes: notes, sharing: sharing}
}

func (h *ShareNoteHandler) Execute(command ShareNoteCommandEvent, ctx *application.ExecutionContext) (application.Nothing, error) {
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
	if err := h.sharing.Share(n, actor, domain.NewID(command.RecipientID)); err != nil {
		return application.Nothing{}, err
	}
	if err := h.notes.Save(n); err != nil {
		return application.Nothing{}, err
	}
	application.PublishDomainEvents(n, ctx)
	return application.Nothing{}, nil
}
