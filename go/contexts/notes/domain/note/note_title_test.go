package note

import (
	"reflect"
	"strings"
	"testing"

	"clean-ddd/architecture/domain"
)

func TestAcceptsATitleAndTrimsIt(t *testing.T) {
	title, err := NewTitle("  Groceries ")
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if title != (Title{value: "Groceries"}) {
		t.Errorf("got %q", title.Value())
	}
}

func TestRefusesABlankTitleAndOneTooLong(t *testing.T) {
	_, err := NewTitle("   ")
	if blank, ok := domain.Refusal(err); !ok || blank.Type != "BlankNoteTitle" {
		t.Errorf("blank: got %v", err)
	}
	_, err = NewTitle(strings.Repeat("x", TitleMaxLength+1))
	tooLong, ok := domain.Refusal(err)
	if !ok || tooLong.Type != "NoteTitleTooLong" {
		t.Fatalf("too long: got %v", err)
	}
	if want := map[string]any{"maxLength": 100, "actualLength": 101}; !reflect.DeepEqual(tooLong.Context, want) {
		t.Errorf("context: got %v, want %v", tooLong.Context, want)
	}
}

func TestCountsCharactersNotBytes(t *testing.T) {
	if _, err := NewTitle(strings.Repeat("é", TitleMaxLength)); err != nil {
		t.Errorf("a hundred accented letters fit: %v", err)
	}
}

func TestComparesByValue(t *testing.T) {
	a, _ := NewTitle("a")
	again, _ := NewTitle("a")
	b, _ := NewTitle("b")
	if a != again {
		t.Error("the same title twice is equal")
	}
	if a == b {
		t.Error("two titles differ")
	}
}
