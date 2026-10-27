package domain

import "github.com/google/uuid"

// ID is the identity of an entity. The domain generates it itself (GenerateID) when it creates
// an aggregate, so a persistence round-trip is never needed to know who a new object is, and
// the repository stays a plain load/save port (ADR 2). A value object: comparable with ==.
type ID struct {
	value string
}

// NewID wraps an identity that already exists (read from storage, received from a client).
func NewID(value string) ID { return ID{value: value} }

// GenerateID is the only place an identity comes from for a new aggregate.
func GenerateID() ID { return ID{value: uuid.NewString()} }

func (id ID) Value() string { return id.value }
