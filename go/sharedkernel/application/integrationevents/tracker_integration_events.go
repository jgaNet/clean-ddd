package integrationevents

import "clean-ddd/architecture/domain"

// OperationCompleteIntegrationEvent is published by the Tracker's bus decorator when a command
// of an authenticated caller reaches its outcome: one notice per command, once there is
// something to say. Type is the command's public name (ShareNote).
type OperationCompleteIntegrationEvent struct {
	domain.IntegrationEvent
	OperationID string
	UserID      string
	Status      string
	Type        string
	Result      any
	Error       string
}
