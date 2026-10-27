package domain

import "testing"

// Two kinds of entity: in Go the kind is the static type, so an Order and an Invoice cannot
// even be compared; Equals is about the id alone.
type order struct{ Entity }

type invoice struct{ Entity }

func TestAnEntityIsTheSameThingAsAnotherOfItsKindWithTheSameID(t *testing.T) {
	if !(order{NewEntity(NewID("a"))}).Equals(NewEntity(NewID("a"))) {
		t.Error("two orders with the same id should be the same thing")
	}
	if (order{NewEntity(NewID("a"))}).Equals(NewEntity(NewID("b"))) {
		t.Error("two orders with different ids should be different things")
	}
	// An Order is never the same thing as an Invoice, whatever the id: they are different
	// static types, which is where the kind lives in Go.
	var one any = order{NewEntity(NewID("a"))}
	var other any = invoice{NewEntity(NewID("a"))}
	if one == other {
		t.Error("an order and an invoice should never be the same thing")
	}
}

func TestAnAggregateCarriesTheVersionItWasReadAtAndPullsItsEventsOnce(t *testing.T) {
	type greeted struct {
		DomainEvent
		Name string
	}
	greeter := NewAggregateRoot(GenerateID(), 3)

	if greeter.Version() != 3 {
		t.Errorf("version: got %d, want 3", greeter.Version())
	}
	if events := greeter.PullDomainEvents(); len(events) != 0 {
		t.Errorf("a fresh aggregate should have no events, got %v", events)
	}

	greeter.Record(greeted{Name: "alice"})
	if events := greeter.PullDomainEvents(); len(events) != 1 || events[0] != (greeted{Name: "alice"}) {
		t.Errorf("pulled events: got %v, want [greeted alice]", events)
	}
	if events := greeter.PullDomainEvents(); len(events) != 0 {
		t.Errorf("a second pull should give nothing, got %v", events)
	}
	if greeter.Version() != 3 {
		t.Errorf("recording an event must not touch the version, got %d", greeter.Version())
	}
}

func TestAValueObjectComparesByValueAndKind(t *testing.T) {
	type email struct{ value string }
	type name struct{ value string }

	one, same, other := email{"a@b.io"}, email{"a@b.io"}, email{"c@d.io"}
	if one != same {
		t.Error("two emails with the same value should be equal")
	}
	if one == other {
		t.Error("two emails with different values should differ")
	}
	var anotherKind any = name{"x"}
	if any(email{"x"}) == anotherKind {
		t.Error("an email and a name holding the same string should differ")
	}
	a, again, generated, another := NewID("a"), NewID("a"), GenerateID(), GenerateID()
	if a != again {
		t.Error("two ids with the same value should be equal")
	}
	if generated == another {
		t.Error("two generated ids should differ")
	}
	if NewID("a").Value() != "a" {
		t.Error("an id gives back its value")
	}
}
