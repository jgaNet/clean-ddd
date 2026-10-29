package events

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notes/domain/note"
	"clean-ddd/sharedkernel/application/integrationevents"
)

type recordingBus struct{ published []domain.Event }

func (*recordingBus) Connect() error { return nil }

func (b *recordingBus) Publish(event domain.Event, context *application.ExecutionContext) *application.Operation {
	b.published = append(b.published, event)
	return application.NewOperation(event, context)
}

func (b *recordingBus) PublishWithID(event domain.Event, context *application.ExecutionContext, _ string) *application.Operation {
	return b.Publish(event, context)
}

func (*recordingBus) Dispatch(*application.Operation)          {}
func (*recordingBus) Subscribe(string, application.Subscriber) {}

func TestRepublishesTheDomainEventAsTheIntegrationEventOtherContextsSubscribeTo(t *testing.T) {
	bus := &recordingBus{}
	context := application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus})

	err := NoteSharedHandler{}.Execute(note.NoteSharedEvent{NoteID: "note-1", Title: "Groceries", OwnerID: "alice", RecipientID: "bob"}, context)
	if err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}

	want := []domain.Event{integrationevents.NoteSharedIntegrationEvent{NoteID: "note-1", Title: "Groceries", OwnerID: "alice", RecipientID: "bob"}}
	if !reflect.DeepEqual(bus.published, want) {
		t.Errorf("published: got %v, want %v", bus.published, want)
	}
}

func TestTheReactionIsSubscribedUnderNoteSharedEventAndMarksTheOperationSent(t *testing.T) {
	bus := &recordingBus{}
	context := application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus})
	subscription := application.Reaction[note.NoteSharedEvent](NoteSharedHandler{})
	operation := application.NewOperation(note.NoteSharedEvent{NoteID: "note-1", Title: "Groceries", OwnerID: "alice", RecipientID: "bob"}, context)

	subscription.Handlers[0].Handle(operation)

	if subscription.Channel != "NoteSharedEvent" {
		t.Errorf("channel: got %q", subscription.Channel)
	}
	if operation.Status != application.StatusSent {
		t.Errorf("status: got %s, want SENT", operation.Status)
	}
	if len(bus.published) != 1 || domain.NameOf(bus.published[0]) != "NoteSharedIntegrationEvent" {
		t.Errorf("published: got %v", bus.published)
	}
}

func TestNoteCreatedIsLoggedAndPublishesNothing(t *testing.T) {
	bus := &recordingBus{}
	context := application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus})

	if err := (NoteCreatedHandler{}).Execute(note.NoteCreatedEvent{NoteID: "note-1", OwnerID: "alice", Title: "Groceries"}, context); err != nil {
		t.Fatalf("unexpected failure: %v", err)
	}
	if len(bus.published) != 0 {
		t.Errorf("published: got %v, want nothing", bus.published)
	}
}
