package domain

// Entity is an object defined by its identity, not by its attributes: two entities of the same
// kind with the same id are the same thing even if their fields differ, and two with different
// ids are different things even if every field matches. The kind is the static type in Go (an
// Account and a Note that happened to share an id are not comparable); Equals compares ids.
//
// Most of the time you will embed AggregateRoot rather than Entity directly: the root is the
// entity through which the rest of its aggregate is reached. State stays in unexported fields,
// reached through methods, and that is the encapsulation the whole design rests on.
//
// Example: contexts/notes/domain/note/note.go
type Entity struct {
	id ID
}

func NewEntity(id ID) Entity { return Entity{id: id} }

func (e Entity) ID() ID { return e.id }

// Equals says whether two entities of one kind are the same thing, whatever their attributes.
func (e Entity) Equals(other Entity) bool { return e.id == other.id }
