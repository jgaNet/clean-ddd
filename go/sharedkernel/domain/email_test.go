package domain

import (
	"strings"
	"testing"

	"clean-ddd/architecture/domain"
)

func TestAcceptsAWellFormedAddressAndNormalisesIt(t *testing.T) {
	email, err := NewEmail("  Alice@Example.com ")
	if err != nil {
		t.Fatalf("unexpected refusal: %v", err)
	}
	if email.Value() != "alice@example.com" {
		t.Errorf("value: got %q", email.Value())
	}
	if email.Username() != "alice" {
		t.Errorf("username: got %q", email.Username())
	}
}

func TestRefusesWhatIsNotAnAddress(t *testing.T) {
	for _, raw := range []string{"", "alice", "alice@", "@example.com", "alice@example", "a b@example.com", strings.Repeat("a", 250) + "@b.io"} {
		t.Run(raw, func(t *testing.T) {
			_, err := NewEmail(raw)
			refused, ok := domain.Refusal(err)
			if !ok {
				t.Fatalf("%q should be refused, got %v", raw, err)
			}
			if refused.Type != "InvalidEmailFormat" {
				t.Errorf("type: got %q", refused.Type)
			}
			if refused.Context["email"] != raw {
				t.Errorf("the refusal names the input: got %v", refused.Context)
			}
		})
	}
}

func TestComparesByValue(t *testing.T) {
	a, _ := NewEmail("a@b.io")
	b, _ := NewEmail("A@B.IO")
	c, _ := NewEmail("c@d.io")
	if a != b {
		t.Error("the same address in another case is the same email")
	}
	if a == c {
		t.Error("two addresses are two emails")
	}
}
