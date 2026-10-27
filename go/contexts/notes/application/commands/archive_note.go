package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notes/domain/note"
	kernel "clean-ddd/sharedkernel/application"
)

type ArchiveNoteCommandEvent struct {
	domain.CommandEvent
	NoteID string
}

type ArchiveNoteHandler struct {
	notes note.Repository
}

func NewArchiveNoteHandler(notes note.Repository) *ArchiveNoteHandler {
	return &ArchiveNoteHandler{notes: notes}
}

func (h *ArchiveNoteHandler) Execute(command ArchiveNoteCommandEvent, ctx *application.ExecutionContext) (application.Nothing, error) {
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
	if err := n.Archive(actor); err != nil {
		return application.Nothing{}, err
	}
	if err := h.notes.Save(n); err != nil {
		return application.Nothing{}, err
	}
	application.PublishDomainEvents(n, ctx)
	return application.Nothing{}, nil
}
