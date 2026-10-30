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

// ParseChannels turns the names a client sent into channels, or refuses the first one the domain
// does not know (UnknownChannel): whether a name is a channel is the domain's to say, not the
// request's (API-BODY-SHAPE). An empty list is the delivery strategy's refusal.
func ParseChannels(names []string) ([]Channel, error) {
	channels := make([]Channel, 0, len(names))
	for _, name := range names {
		channel, known := ParseChannel(name)
		if !known {
			return nil, UnknownChannel(name)
		}
		channels = append(channels, channel)
	}
	return channels, nil
}
