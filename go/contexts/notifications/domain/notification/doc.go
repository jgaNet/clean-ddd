// Package notification is the Notification aggregate of the Notifications context: the
// aggregate itself, its child entity (the delivery attempt), its value object (the delivery
// strategy), its events, its exceptions, its snapshot and its ports (the channels, the
// repository, the queries). Everything that can happen to a notification goes through a method
// of Notification, which enforces the business rules before changing state; the package never
// touches persistence, logging or transport.
package notification
