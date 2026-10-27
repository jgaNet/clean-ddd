package domain

import (
	"reflect"
	"strings"
)

// Event is a named, immutable payload. Every message in the system is one.
//
// The three kinds share one shape and differ in intent, which is why they are distinct marker
// types a struct embeds: a handler, a bus decorator or a test can tell them apart with Kind().
//
//   - CommandEvent      asks for something to happen; one handler, may be refused.
//     CreateNoteCommandEvent, published by a route, answered with an operation id.
//   - DomainEvent       states that something happened inside a context; recorded by an
//     aggregate, published after commit, any number of handlers. NoteSharedEvent.
//   - IntegrationEvent  tells other contexts about it; the published contract of a context, kept
//     in sharedkernel/application/integrationevents. NoteSharedIntegrationEvent.
//
// An event is a struct whose exported fields are its payload, embedding the marker of its kind;
// its name is its type name, which is the channel the bus routes on, read by NameOf:
//
//	type NoteSharedEvent struct {
//	    domain.DomainEvent
//	    NoteID      string
//	    RecipientID string
//	}
//
// Being a plain struct, an event compares by value: a test that asserts the recorded events
// with reflect.DeepEqual compares every field.
type Event interface {
	// Kind says which of the three kinds a message is; the embedded marker answers it.
	Kind() EventKind
}

type EventKind string

const (
	KindCommand     EventKind = "Command"
	KindDomain      EventKind = "Domain"
	KindIntegration EventKind = "Integration"
)

// CommandEvent is the marker a command embeds: a request that something happen.
type CommandEvent struct{}

func (CommandEvent) Kind() EventKind { return KindCommand }

// DomainEvent is the marker a domain event embeds: a fact that happened inside a context.
type DomainEvent struct{}

func (DomainEvent) Kind() EventKind { return KindDomain }

// IntegrationEvent is the marker a contract embeds: a fact restated for other contexts.
type IntegrationEvent struct{}

func (IntegrationEvent) Kind() EventKind { return KindIntegration }

// NameOf is the name the bus routes on: the event's type name, from an instance.
func NameOf(event Event) string {
	t := reflect.TypeOf(event)
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return t.Name()
}

// NameOfType is the same name from the type alone, for a subscription written before any
// instance exists: NameOfType[NoteSharedEvent]().
func NameOfType[E Event]() string {
	t := reflect.TypeFor[E]()
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	return t.Name()
}

// PublicNameOf is the name a message has outside the process — on an operation record, in a
// completion notice: its intent or its fact, without the suffix that names its kind here
// (ShareNote, NoteShared, OperationComplete). The bus keeps routing on the full name; the suffix
// is this codebase's naming convention, and every language answers the same API (API-ONE-SURFACE).
func PublicNameOf(event Event) string {
	return PublicName(NameOf(event))
}

// PublicName strips the kind's suffix from an event name.
func PublicName(name string) string {
	for _, suffix := range []string{"CommandEvent", "IntegrationEvent", "Event"} {
		if strings.HasSuffix(name, suffix) {
			return strings.TrimSuffix(name, suffix)
		}
	}
	return name
}
