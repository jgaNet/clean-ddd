package channels

import (
	"fmt"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/contexts/notifications/domain/notification"
)

// EmailChannel is email delivery. This reference project has no mail server: the adapter logs
// what it would send. A real one would hand the same Delivery to an SMTP client or a provider
// API, and nothing above this file would change. The address comes with the delivery, in its
// metadata ("email"): a notification without one cannot go by email.
type EmailChannel struct {
	logger application.Logger
	from   string
}

// NewEmailChannel takes the logger (nil for a silent one) and the sender's address.
func NewEmailChannel(logger application.Logger, fromEmail string) *EmailChannel {
	return &EmailChannel{logger: logger, from: fromEmail}
}

func (c *EmailChannel) Channel() notification.Channel { return notification.ChannelEmail }

func (c *EmailChannel) IsAvailableFor(string) (bool, error) { return true, nil }

func (c *EmailChannel) Deliver(delivery notification.Delivery) error {
	to, _ := delivery.Metadata["email"].(string)
	if to == "" {
		return domain.Unknown(fmt.Sprintf("No email address for recipient %s", delivery.RecipientID), nil)
	}
	if c.logger != nil {
		c.logger.Info(fmt.Sprintf("[EMAIL] from %s to %s: %s", c.from, to, delivery.Title), nil)
		c.logger.Debug(delivery.Content, nil)
	}
	return nil
}
