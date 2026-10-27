package commands

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notes/application/suggestions"
	"clean-ddd/contexts/notes/domain/note"
	kernel "clean-ddd/sharedkernel/application"
)

// SuggestNoteTitle is the canonical example of ADR 7: a decision the domain cannot make from
// its own state enters it as a value. The handler asks the port (the only non-deterministic
// step), then hands the suggestion to the aggregate exactly as it would hand it a title typed
// by the owner: Edit applies Title's rules and the owner-and-active rules, and refuses a blank
// or too long suggestion like any other. The source proposes; the domain disposes.
//
// The suggestion, with its provenance, is the operation's result: the Tracker keeps it, so an
// accepted title can be traced to the source and the version that proposed it.

// SuggestNoteTitleCommandEvent asks for a title for the note, from its content, and applies it if the note accepts it.
type SuggestNoteTitleCommandEvent struct {
	domain.CommandEvent
	NoteID string
}

type SuggestNoteTitleHandler struct {
	notes       note.Repository
	suggestions suggestions.TitleSuggestions
}

func NewSuggestNoteTitleHandler(notes note.Repository, titles suggestions.TitleSuggestions) *SuggestNoteTitleHandler {
	return &SuggestNoteTitleHandler{notes: notes, suggestions: titles}
}

func (h *SuggestNoteTitleHandler) Execute(command SuggestNoteTitleCommandEvent, ctx *application.ExecutionContext) (suggestions.TitleSuggestion, error) {
	var none suggestions.TitleSuggestion
	actor, err := kernel.RequireSignedIn(ctx, note.Service)
	if err != nil {
		return none, err
	}
	n, err := h.notes.FindByID(command.NoteID)
	if err != nil {
		return none, err
	}
	if n == nil {
		return none, note.NoteNotFound(command.NoteID)
	}
	suggestion, err := h.suggestions.Suggest(n.Content())
	if err != nil {
		return none, err
	}
	if err := n.Edit(actor, suggestion.Title, n.Content()); err != nil {
		return none, err
	}
	if err := h.notes.Save(n); err != nil {
		return none, err
	}
	application.PublishDomainEvents(n, ctx)
	return suggestion, nil
}
