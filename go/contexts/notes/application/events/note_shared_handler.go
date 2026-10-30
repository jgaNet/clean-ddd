package events

import (
	"fmt"

	"clean-ddd/architecture/application"
	"clean-ddd/contexts/notes/domain/note"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// NoteSharedHandler is where a domain event leaves its context. The handler owns the
// translation from the Notes vocabulary (NoteSharedEvent, internal) to the published one
// (NoteSharedIntegrationEvent, shared kernel). Nothing else about Notes crosses the border.
// The fact goes out through the outbox, when the reaction's own transaction commits (ADR 30).
type NoteSharedHandler struct{}

func (NoteSharedHandler) Execute(event note.NoteSharedEvent, ctx *application.ExecutionContext) error {
	ctx.Log().Debug(fmt.Sprintf("Note %s shared with %s", event.NoteID, event.RecipientID), application.Meta{"traceId": ctx.TraceID()})
	application.PublishIntegrationEvent(integrationevents.NoteSharedIntegrationEvent{
		NoteID:      event.NoteID,
		Title:       event.Title,
		OwnerID:     event.OwnerID,
		RecipientID: event.RecipientID,
	}, ctx)
	return nil
}
