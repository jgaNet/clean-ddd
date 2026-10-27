package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notes/domain/note"
	kernel "clean-ddd/sharedkernel/application"
)

// PinNote puts a note first in its owner's list. The shape of EditNote: who is calling -> load
// -> ask the aggregate -> save -> publish. Who may pin, and that an archived note cannot be
// pinned, is the aggregate's rule, returned as is.

type PinNoteCommandEvent struct {
	domain.CommandEvent
	NoteID string
}

type PinNoteHandler struct {
	notes note.Repository
}

func NewPinNoteHandler(notes note.Repository) *PinNoteHandler {
	return &PinNoteHandler{notes: notes}
}

func (h *PinNoteHandler) Execute(command PinNoteCommandEvent, ctx *application.ExecutionContext) (application.Nothing, error) {
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
	if err := n.Pin(actor); err != nil {
		return application.Nothing{}, err
	}
	if err := h.notes.Save(n); err != nil {
		return application.Nothing{}, err
	}
	application.PublishDomainEvents(n, ctx)
	return application.Nothing{}, nil
}
