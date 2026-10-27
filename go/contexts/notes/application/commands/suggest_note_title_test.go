package commands

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"clean-ddd/contexts/notes/application/suggestions"
	"clean-ddd/contexts/notes/domain/note"
)

var at = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

// proposing is the non-deterministic source, made deterministic for the test: it proposes
// what the test says, and counts how often it was asked.
type proposing struct {
	title string
	asked int
}

func (p *proposing) Suggest(string) (suggestions.TitleSuggestion, error) {
	p.asked++
	return suggestions.TitleSuggestion{
		Title:      p.title,
		Provenance: suggestions.Provenance{Source: "test", Version: "1", At: at},
	}, nil
}

func TestSuggestNoteTitleAppliesASuggestionTheNoteAcceptsAndAnswersItWithItsProvenance(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")
	source := &proposing{title: "Errands"}

	suggestion, err := NewSuggestNoteTitleHandler(notes.repository, source).Execute(SuggestNoteTitleCommandEvent{NoteID: noteID}, notes.contextFor("alice"))
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}

	want := suggestions.TitleSuggestion{Title: "Errands", Provenance: suggestions.Provenance{Source: "test", Version: "1", At: at}}
	if !reflect.DeepEqual(suggestion, want) {
		t.Errorf("suggestion: got %+v, want %+v", suggestion, want)
	}
	if title := notes.stored(noteID).Title; title != "Errands" {
		t.Errorf("stored title: got %q", title)
	}
	if source.asked != 1 {
		t.Errorf("the source should be asked once, was asked %d times", source.asked)
	}
	samePublished(t, notes.bus.published, note.NoteEditedEvent{NoteID: noteID, Title: "Errands"})
}

func TestSuggestNoteTitleLetsTheNoteRefuseASuggestionThatBreaksItsRulesAndChangesNothing(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")

	_, err := NewSuggestNoteTitleHandler(notes.repository, &proposing{title: strings.Repeat("x", note.TitleMaxLength+1)}).Execute(SuggestNoteTitleCommandEvent{NoteID: noteID}, notes.contextFor("alice"))

	if refusalType(t, err) != "NoteTitleTooLong" {
		t.Errorf("got %v", err)
	}
	if title := notes.stored(noteID).Title; title != "Groceries" {
		t.Errorf("stored title: got %q, want Groceries", title)
	}
	samePublished(t, notes.bus.published)
}

func TestSuggestNoteTitleIsTheOwnersToAskAnyoneElseIsRefused(t *testing.T) {
	notes := newFixture(t)
	noteID := notes.aNoteOwnedBy("alice")
	source := &proposing{title: "Errands"}

	_, err := NewSuggestNoteTitleHandler(notes.repository, source).Execute(SuggestNoteTitleCommandEvent{NoteID: noteID}, notes.contextFor("bob"))

	if refusalType(t, err) != "NotNoteOwner" {
		t.Errorf("got %v", err)
	}
	if title := notes.stored(noteID).Title; title != "Groceries" {
		t.Errorf("stored title: got %q, want Groceries", title)
	}
}

func TestSuggestNoteTitleFailsOnAnUnknownNoteWithoutAskingTheSource(t *testing.T) {
	notes := newFixture(t)
	source := &proposing{title: "Errands"}

	_, err := NewSuggestNoteTitleHandler(notes.repository, source).Execute(SuggestNoteTitleCommandEvent{NoteID: "nope"}, notes.contextFor("alice"))

	if refusalType(t, err) != "NoteNotFound" {
		t.Errorf("got %v", err)
	}
	if source.asked != 0 {
		t.Error("there is nothing to ask a title for")
	}
}
