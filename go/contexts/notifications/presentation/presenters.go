package presentation

import (
	"fmt"

	"clean-ddd/contexts/notifications/domain/notification"
)

// NotificationHTMXPresenter is what a live notification looks like in the HTMX front end: an
// out-of-band swap into #notifications. Its Present is the render function the websocket
// channel takes, so the channel knows nothing about markup.
type NotificationHTMXPresenter struct{}

func (NotificationHTMXPresenter) Present(delivery notification.Delivery) string {
	return fmt.Sprintf(`<div id="notifications" hx-swap-oob="innerHTML">%s</div>`, delivery.Content)
}
