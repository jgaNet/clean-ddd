package notification

import "slices"

// DeliveryStrategy is the ordered list of channels to try until one accepts the notification: a
// value object, so a strategy is always non-empty and free of duplicates, and two strategies
// with the same channels in the same order are the same strategy (the order is the strategy).
// A slice is not comparable with ==, so Equals says it.
type DeliveryStrategy struct {
	channels []Channel
}

// NewDeliveryStrategy drops the duplicates, keeps the order, and refuses an empty list.
func NewDeliveryStrategy(channels []Channel) (DeliveryStrategy, error) {
	distinct := make([]Channel, 0, len(channels))
	for _, channel := range channels {
		if !slices.Contains(distinct, channel) {
			distinct = append(distinct, channel)
		}
	}
	if len(distinct) == 0 {
		return DeliveryStrategy{}, EmptyDeliveryStrategy()
	}
	return DeliveryStrategy{channels: distinct}, nil
}

// Channels is the strategy, in order; a copy, since the value is immutable.
func (s DeliveryStrategy) Channels() []Channel { return slices.Clone(s.channels) }

// Equals says whether two strategies are the same value: the same channels in the same order.
func (s DeliveryStrategy) Equals(other DeliveryStrategy) bool {
	return slices.Equal(s.channels, other.channels)
}
