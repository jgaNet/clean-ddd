package note

// Snapshot is the plain data the aggregate is persisted as and rebuilt from. The aggregate
// (note.go) owns the behaviour and the rules; these types own nothing. The snapshot is the
// only shape that crosses the domain boundary towards the infrastructure.
type Snapshot struct {
	ID         string
	OwnerID    string
	Title      string
	Content    string
	Status     Status
	SharedWith []string
	// Version is the one this snapshot was read at; the repository stores version + 1 (ADR 8).
	Version int
}

// NewNote is what is needed to write a brand new note.
type NewNote struct {
	OwnerID string
	Title   string
	Content string
}
