package notification

// Channel is one of the ways a notification can reach someone. One infrastructure adapter per
// value (the NotificationChannel port). A value the outside sends as a string reaches the
// domain as a string; ParseChannel is the type guard that turns it into a Channel.
type Channel string

const (
	ChannelWebSocket Channel = "WEBSOCKET"
	ChannelEmail     Channel = "EMAIL"
)

// ParseChannel is the type guard: a string that names a channel, or false.
func ParseChannel(value string) (Channel, bool) {
	switch Channel(value) {
	case ChannelWebSocket, ChannelEmail:
		return Channel(value), true
	}
	return "", false
}
