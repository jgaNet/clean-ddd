package note

// Read models: the shapes a screen or an API wants to display. They are plain data, tailored
// to a use case, and they never come back into the domain.
//
// Queries is the read side (the "Q" of CQRS). It returns read models, not aggregates, so the
// read side is free to be shaped, indexed and cached however the screens need, without
// dragging the business rules along (ADR 5).

type ListItem struct {
	ID     string
	Title  string
	Status Status
}

type Detail struct {
	ID         string
	Title      string
	Status     Status
	OwnerID    string
	Content    string
	SharedWith []string
}

type SharedListItem struct {
	ID      string
	Title   string
	Content string
	OwnerID string
}

type Queries interface {
	// FindByID answers nil, nil for an unknown id.
	FindByID(noteID string) (*Detail, error)
	// FindByOwner lists in the order they were saved. Ordering is part of this contract: the
	// contract test asserts it for every adapter.
	FindByOwner(ownerID string) ([]ListItem, error)
	// FindSharedWith lists in the order they were saved.
	FindSharedWith(accountID string) ([]SharedListItem, error)
}
