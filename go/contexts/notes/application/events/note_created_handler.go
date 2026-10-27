package events

import (
	"fmt"

	"clean-ddd/architecture/application"
	"clean-ddd/contexts/notes/domain/note"
)

type NoteCreatedHandler struct{}

func (NoteCreatedHandler) Execute(event note.NoteCreatedEvent, ctx *application.ExecutionContext) error {
	ctx.Log().Debug(fmt.Sprintf("Note %s created by %s", event.NoteID, event.OwnerID), application.Meta{"traceId": ctx.TraceID()})
	return nil
}
