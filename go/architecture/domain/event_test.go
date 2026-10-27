package domain

import "testing"

type noteSharedEvent struct {
	DomainEvent
	NoteID string
}

type shareNoteCommandEvent struct{ CommandEvent }

type noteSharedIntegrationEvent struct{ IntegrationEvent }

func TestAnEventIsNamedAfterItsTypeFromAnInstanceOrAPointer(t *testing.T) {
	if name := NameOf(noteSharedEvent{NoteID: "n1"}); name != "noteSharedEvent" {
		t.Errorf("NameOf: got %q", name)
	}
	if name := NameOf(&noteSharedEvent{}); name != "noteSharedEvent" {
		t.Errorf("NameOf on a pointer: got %q", name)
	}
	if name := NameOfType[noteSharedEvent](); name != "noteSharedEvent" {
		t.Errorf("NameOfType: got %q", name)
	}
	if name := NameOfType[*noteSharedEvent](); name != "noteSharedEvent" {
		t.Errorf("NameOfType on a pointer type: got %q", name)
	}
}

func TestEachMarkerAnswersItsKind(t *testing.T) {
	if kind := (noteSharedEvent{}).Kind(); kind != KindDomain {
		t.Errorf("a domain event: got %q", kind)
	}
	if kind := (shareNoteCommandEvent{}).Kind(); kind != KindCommand {
		t.Errorf("a command: got %q", kind)
	}
	if kind := (noteSharedIntegrationEvent{}).Kind(); kind != KindIntegration {
		t.Errorf("an integration event: got %q", kind)
	}
}

func TestThePublicNameDropsTheSuffixOfTheKind(t *testing.T) {
	cases := map[string]string{
		"ShareNoteCommandEvent":             "ShareNote",
		"NoteSharedEvent":                   "NoteShared",
		"NoteSharedIntegrationEvent":        "NoteShared",
		"OperationCompleteIntegrationEvent": "OperationComplete",
		"Greeted":                           "Greeted",
	}
	for name, want := range cases {
		if got := PublicName(name); got != want {
			t.Errorf("PublicName(%q): got %q, want %q", name, got, want)
		}
	}
	if got := PublicNameOf(shareNoteCommandEvent{}); got != "shareNote" {
		t.Errorf("PublicNameOf: got %q", got)
	}
}
