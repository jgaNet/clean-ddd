package note

import (
	"errors"
	"reflect"
	"testing"

	"clean-ddd/architecture/domain"
)

// directory is the port alone: a list of known ids is a directory. A domain test needs no more.
type directory struct {
	known   []string
	failing error
}

func (d directory) Exists(accountID string) (bool, error) {
	if d.failing != nil {
		return false, d.failing
	}
	for _, id := range d.known {
		if id == accountID {
			return true, nil
		}
	}
	return false, nil
}

var alice, bob = domain.NewID("alice"), domain.NewID("bob")

func aNoteOf(t *testing.T, owner domain.ID) *Note {
	t.Helper()
	n, err := Create(NewNote{OwnerID: owner.Value(), Title: "Groceries", Content: "Milk"})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	return n
}

func TestSharesWithAnAccountTheDirectoryKnows(t *testing.T) {
	n := aNoteOf(t, alice)
	if err := NewSharing(directory{known: []string{"alice", "bob"}}).Share(n, alice, bob); err != nil {
		t.Fatalf("Share: %v", err)
	}
	if !reflect.DeepEqual(n.SharedWith(), []string{"bob"}) {
		t.Errorf("shared with: got %v", n.SharedWith())
	}
}

func TestRefusesAnAccountTheDirectoryDoesNotKnowBeforeTheAggregateIsTouched(t *testing.T) {
	n := aNoteOf(t, alice)
	err := NewSharing(directory{known: []string{"alice"}}).Share(n, alice, bob)
	if refused, ok := domain.Refusal(err); !ok || refused.Type != "RecipientNotFound" {
		t.Errorf("got %v, want RecipientNotFound", err)
	}
	if len(n.SharedWith()) != 0 {
		t.Errorf("the aggregate should be untouched, got %v", n.SharedWith())
	}
	if events := n.PullDomainEvents(); len(events) != 1 {
		t.Errorf("only the creation should be recorded, got %v", events)
	}
}

func TestStillLeavesTheNotesOwnRulesToTheAggregate(t *testing.T) {
	n := aNoteOf(t, alice)
	err := NewSharing(directory{known: []string{"alice", "bob"}}).Share(n, bob, alice)
	if refused, ok := domain.Refusal(err); !ok || refused.Type != "NotNoteOwner" {
		t.Errorf("got %v, want NotNoteOwner", err)
	}
}

func TestPassesADirectoryFailureOn(t *testing.T) {
	n := aNoteOf(t, alice)
	down := errors.New("directory down")
	err := NewSharing(directory{failing: down}).Share(n, alice, bob)
	if !errors.Is(err, down) {
		t.Errorf("got %v, want the directory's failure", err)
	}
	if len(n.SharedWith()) != 0 {
		t.Error("the aggregate should be untouched")
	}
}
