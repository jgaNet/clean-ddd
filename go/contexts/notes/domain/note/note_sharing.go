package note

import "clean-ddd/architecture/domain"

// Sharing is a domain service: "a note can only be shared with an account that exists" is a
// business rule, but the aggregate cannot check it alone because accounts live in another
// context. The service asks through a port Notes owns (AccountDirectory), then lets the
// aggregate apply its own rules (owner only, not archived, not twice, not yourself).
type Sharing struct {
	accounts AccountDirectory
}

func NewSharing(accounts AccountDirectory) *Sharing {
	return &Sharing{accounts: accounts}
}

func (s *Sharing) Share(note *Note, actor, recipient domain.ID) error {
	exists, err := s.accounts.Exists(recipient.Value())
	if err != nil {
		return err
	}
	if !exists {
		return RecipientNotFound(note.ID().Value(), recipient.Value())
	}
	return note.ShareWith(actor, recipient)
}
