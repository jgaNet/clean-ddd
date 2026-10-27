package notification

import "clean-ddd/architecture/domain"

// Domain events are facts raised by the Notification aggregate. They stay inside the context: a
// notification is the end of a chain, and announcing it would notify about the notification,
// and so on.

type NotificationSentEvent struct {
	domain.DomainEvent
	NotificationID string
	RecipientID    string
	Via            Channel
}

type NotificationFailedEvent struct {
	domain.DomainEvent
	NotificationID string
	RecipientID    string
}

type NotificationReadEvent struct {
	domain.DomainEvent
	NotificationID string
	RecipientID    string
}
