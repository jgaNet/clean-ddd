package notification

// Delivery is what a channel receives: enough to deliver, nothing about how the aggregate is built.
type Delivery struct {
	NotificationID string
	RecipientID    string
	Title          string
	Content        string
	Metadata       map[string]any
}

// NotificationChannel is the port one infrastructure adapter implements per Channel value
// (websocket, email...). The port knows nothing about logging or transport: an adapter that
// needs a logger takes it in its constructor.
type NotificationChannel interface {
	Channel() Channel
	IsAvailableFor(recipientID string) (bool, error)
	// Deliver hands the notification to the channel; an error is the channel's refusal, which
	// the aggregate records as a failed attempt.
	Deliver(delivery Delivery) error
}
