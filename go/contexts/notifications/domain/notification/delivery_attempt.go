package notification

import (
	"time"

	"clean-ddd/architecture/domain"
)

// DeliveryAttempt is an entity that is not an aggregate root: it has its own identity (two
// attempts on the same channel are two different attempts), but it only exists inside a
// Notification, is created and reached through it, records no events of its own, and is
// persisted as part of the Notification's snapshot. Nothing outside the aggregate holds one,
// which is why its constructors are not exported.
type DeliveryAttempt struct {
	domain.Entity
	channel   Channel
	at        time.Time
	succeeded bool
}

func newDeliveryAttempt(channel Channel, succeeded bool, at time.Time) DeliveryAttempt {
	return DeliveryAttempt{Entity: domain.NewEntity(domain.GenerateID()), channel: channel, at: at, succeeded: succeeded}
}

func attemptFromSnapshot(snapshot DeliveryAttemptSnapshot) DeliveryAttempt {
	return DeliveryAttempt{Entity: domain.NewEntity(domain.NewID(snapshot.ID)), channel: snapshot.Channel, at: snapshot.At, succeeded: snapshot.Succeeded}
}

func (a DeliveryAttempt) ToSnapshot() DeliveryAttemptSnapshot {
	return DeliveryAttemptSnapshot{ID: a.ID().Value(), Channel: a.channel, At: a.at, Succeeded: a.succeeded}
}

func (a DeliveryAttempt) Channel() Channel { return a.channel }
func (a DeliveryAttempt) At() time.Time    { return a.at }
func (a DeliveryAttempt) Succeeded() bool  { return a.succeeded }
