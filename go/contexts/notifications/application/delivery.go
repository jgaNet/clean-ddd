package application

import (
	"fmt"

	archapp "clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notifications/domain/notification"
)

// NotificationDelivery is the one use case every entry point of this context ends in: create
// the notification, try its channels in order until one accepts it, keep the story. An
// application service because it orchestrates ports and publishes events; it holds no rule of
// its own (the aggregate decides which channel is next and when it is sent or failed).
//
// Called by the SendNotification command (manual, administrators) and by the anti-corruption
// handlers reacting to other contexts.
type NotificationDelivery struct {
	notifications notification.Repository
	channels      map[notification.Channel]notification.NotificationChannel
}

func NewNotificationDelivery(notifications notification.Repository, channels []notification.NotificationChannel) *NotificationDelivery {
	adapters := make(map[notification.Channel]notification.NotificationChannel, len(channels))
	for _, adapter := range channels {
		adapters[adapter.Channel()] = adapter
	}
	return &NotificationDelivery{notifications: notifications, channels: adapters}
}

// Deliver answers with the id of the notification it created and tried to deliver; a
// notification no channel accepted is saved FAILED, which is an outcome, not a refusal.
func (d *NotificationDelivery) Deliver(props notification.NewNotification, ctx *archapp.ExecutionContext) (string, error) {
	n, err := notification.Create(props)
	if err != nil {
		return "", err
	}

	delivery := notification.Delivery{
		NotificationID: n.ID().Value(),
		RecipientID:    n.RecipientID().Value(),
		Title:          n.Title(),
		Content:        n.Content(),
		Metadata:       n.Metadata(),
	}

	for _, channel := range n.ChannelsToTry() {
		outcome := d.try(channel, delivery)
		if outcome != nil {
			ctx.Log().Debug(fmt.Sprintf("Notification %s: %s failed (%s)", delivery.NotificationID, channel, outcome.Error()),
				archapp.Meta{"traceId": ctx.TraceID()})
		}
		if err := n.RecordAttempt(channel, outcome == nil); err != nil {
			return "", err
		}
		if outcome == nil {
			break
		}
	}

	if err := d.notifications.Save(n); err != nil {
		return "", err
	}
	archapp.PublishDomainEvents(n, ctx)
	return n.ID().Value(), nil
}

// try asks one channel: a channel with no adapter, or one not available for the recipient, is a
// failed attempt like a refusal from the adapter.
func (d *NotificationDelivery) try(channel notification.Channel, delivery notification.Delivery) error {
	adapter, known := d.channels[channel]
	if !known {
		return domain.Unknown(fmt.Sprintf("%s unavailable", channel), nil)
	}
	available, err := adapter.IsAvailableFor(delivery.RecipientID)
	if err != nil {
		return err
	}
	if !available {
		return domain.Unknown(fmt.Sprintf("%s unavailable", channel), nil)
	}
	return adapter.Deliver(delivery)
}
