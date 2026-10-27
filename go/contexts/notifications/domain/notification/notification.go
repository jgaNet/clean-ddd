package notification

import (
	"fmt"
	"maps"
	"slices"
	"strings"
	"time"

	"clean-ddd/architecture/domain"
)

// Notification is the aggregate root of the Notifications context: something to tell one
// account, and the story of how it was delivered.
//
//   - it always has a title, a content and a non-empty delivery strategy
//   - each channel is tried at most once; the attempts are child entities (DeliveryAttempt)
//   - the first channel that accepts it makes it SENT; when none is left it is FAILED
//   - only its recipient can mark it read, and only once it was delivered
//
// Talking to a channel is not the aggregate's job (see the NotificationChannel port and the
// NotificationDelivery application service); recording what happened is. The only ways in are
// Create and FromSnapshot; the state stays in unexported fields.
//
// Time is a parameter with a default (DOMAIN-NON-DETERMINISM): Create, RecordAttempt and
// MarkRead take an optional instant, and use the clock when given none.
type Notification struct {
	domain.AggregateRoot
	recipientID  domain.ID
	title        string
	content      string
	strategy     DeliveryStrategy
	status       Status
	createdAt    time.Time
	metadata     map[string]any
	attempts     []DeliveryAttempt
	sentAt       *time.Time
	readAt       *time.Time
	deliveredVia Channel
}

// Create writes a brand new notification, PENDING, with nothing tried yet. This is the only
// way to bring a Notification into existence; the aggregate picks its own identity.
func Create(props NewNotification, now ...time.Time) (*Notification, error) {
	title := strings.TrimSpace(props.Title)
	if title == "" {
		return nil, BlankNotificationTitle()
	}
	content := strings.TrimSpace(props.Content)
	if content == "" {
		return nil, BlankNotificationContent()
	}
	strategy, err := NewDeliveryStrategy(props.Channels)
	if err != nil {
		return nil, err
	}
	return &Notification{
		AggregateRoot: domain.NewAggregateRoot(domain.GenerateID(), 0),
		recipientID:   domain.NewID(props.RecipientID),
		title:         title,
		content:       content,
		strategy:      strategy,
		status:        StatusPending,
		createdAt:     timeOr(now),
		metadata:      cloneMetadata(props.Metadata),
		attempts:      []DeliveryAttempt{},
	}, nil
}

// FromSnapshot rebuilds a Notification and its attempts from what was persisted. No event is
// recorded: nothing new happened. Persisted data has already been validated, so an invalid
// snapshot is a programming error and panics instead of returning an error (ADR 4).
func FromSnapshot(snapshot Snapshot) *Notification {
	strategy, err := NewDeliveryStrategy(snapshot.Channels)
	if err != nil || strings.TrimSpace(snapshot.Title) == "" || strings.TrimSpace(snapshot.Content) == "" {
		panic(fmt.Sprintf("corrupted notification %s", snapshot.ID))
	}
	if _, known := ParseStatus(string(snapshot.Status)); !known {
		panic(fmt.Sprintf("corrupted notification %s: unknown status %q", snapshot.ID, snapshot.Status))
	}
	attempts := make([]DeliveryAttempt, 0, len(snapshot.Attempts))
	for _, attempt := range snapshot.Attempts {
		if _, known := ParseChannel(string(attempt.Channel)); !known {
			panic(fmt.Sprintf("corrupted notification %s: unknown channel %q", snapshot.ID, attempt.Channel))
		}
		attempts = append(attempts, attemptFromSnapshot(attempt))
	}
	return &Notification{
		AggregateRoot: domain.NewAggregateRoot(domain.NewID(snapshot.ID), snapshot.Version),
		recipientID:   domain.NewID(snapshot.RecipientID),
		title:         snapshot.Title,
		content:       snapshot.Content,
		strategy:      strategy,
		status:        snapshot.Status,
		createdAt:     snapshot.CreatedAt,
		metadata:      cloneMetadata(snapshot.Metadata),
		attempts:      attempts,
		sentAt:        cloneTime(snapshot.SentAt),
		readAt:        cloneTime(snapshot.ReadAt),
		deliveredVia:  snapshot.DeliveredVia,
	}
}

// ChannelsToTry is the channels of the strategy not tried yet, in order. Empty once delivered
// or exhausted.
func (n *Notification) ChannelsToTry() []Channel {
	if n.status != StatusPending {
		return []Channel{}
	}
	left := []Channel{}
	for _, channel := range n.strategy.Channels() {
		if !n.tried(channel) {
			left = append(left, channel)
		}
	}
	return left
}

// RecordAttempt records what a channel answered. A success delivers the notification; the last
// failure fails it.
func (n *Notification) RecordAttempt(channel Channel, succeeded bool, at ...time.Time) error {
	if n.tried(channel) {
		return ChannelAlreadyTried(n.ID().Value(), channel)
	}
	when := timeOr(at)
	n.attempts = append(n.attempts, newDeliveryAttempt(channel, succeeded, when))

	switch {
	case succeeded:
		n.status = StatusSent
		n.sentAt = &when
		n.deliveredVia = channel
		n.Record(NotificationSentEvent{NotificationID: n.ID().Value(), RecipientID: n.recipientID.Value(), Via: channel})
	case len(n.ChannelsToTry()) == 0:
		n.status = StatusFailed
		n.Record(NotificationFailedEvent{NotificationID: n.ID().Value(), RecipientID: n.recipientID.Value()})
	}
	return nil
}

// MarkRead is the recipient's, once the notification was delivered, and once only.
func (n *Notification) MarkRead(actorID domain.ID, at ...time.Time) error {
	if n.recipientID != actorID {
		return NotNotificationRecipient(n.ID().Value(), actorID.Value())
	}
	if n.status == StatusRead {
		return NotificationAlreadyRead(n.ID().Value())
	}
	if n.status != StatusSent {
		return NotificationNotDelivered(n.ID().Value())
	}
	when := timeOr(at)
	n.status = StatusRead
	n.readAt = &when
	n.Record(NotificationReadEvent{NotificationID: n.ID().Value(), RecipientID: n.recipientID.Value()})
	return nil
}

// ToSnapshot is the plain data to persist. FromSnapshot(n.ToSnapshot()) gives back an equal notification.
func (n *Notification) ToSnapshot() Snapshot {
	attempts := make([]DeliveryAttemptSnapshot, 0, len(n.attempts))
	for _, attempt := range n.attempts {
		attempts = append(attempts, attempt.ToSnapshot())
	}
	return Snapshot{
		ID:           n.ID().Value(),
		RecipientID:  n.recipientID.Value(),
		Title:        n.title,
		Content:      n.content,
		Channels:     n.strategy.Channels(),
		Status:       n.status,
		CreatedAt:    n.createdAt,
		Metadata:     cloneMetadata(n.metadata),
		Attempts:     attempts,
		SentAt:       cloneTime(n.sentAt),
		ReadAt:       cloneTime(n.readAt),
		DeliveredVia: n.deliveredVia,
		Version:      n.Version(),
	}
}

func (n *Notification) tried(channel Channel) bool {
	return slices.ContainsFunc(n.attempts, func(attempt DeliveryAttempt) bool { return attempt.channel == channel })
}

func (n *Notification) RecipientID() domain.ID      { return n.recipientID }
func (n *Notification) Title() string               { return n.title }
func (n *Notification) Content() string             { return n.content }
func (n *Notification) Status() Status              { return n.status }
func (n *Notification) DeliveredVia() Channel       { return n.deliveredVia }
func (n *Notification) Metadata() map[string]any    { return cloneMetadata(n.metadata) }
func (n *Notification) Attempts() []DeliveryAttempt { return slices.Clone(n.attempts) }

// timeOr is the optional instant a behaviour was given, or now.
func timeOr(at []time.Time) time.Time {
	if len(at) > 0 {
		return at[0]
	}
	return time.Now().UTC()
}

func cloneTime(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	clone := *t
	return &clone
}

// cloneMetadata copies the map, and gives an empty one for nil: metadata is never absent.
func cloneMetadata(metadata map[string]any) map[string]any {
	if metadata == nil {
		return map[string]any{}
	}
	return maps.Clone(metadata)
}
