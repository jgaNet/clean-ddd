package integrationevents

import "clean-ddd/architecture/domain"

// The published contract of the Security context: what other contexts may know about accounts.

type AccountCreatedIntegrationEvent struct {
	domain.IntegrationEvent
	AccountID       string
	Email           string
	ValidationToken string
}

type AccountValidatedIntegrationEvent struct {
	domain.IntegrationEvent
	AccountID string
	Email     string
}
