package integrationevents

import "clean-ddd/architecture/domain"

// NoteSharedIntegrationEvent is the published contract of the Notes context: what other
// contexts may know when a note is shared.
type NoteSharedIntegrationEvent struct {
	domain.IntegrationEvent
	NoteID      string
	Title       string
	OwnerID     string
	RecipientID string
}
