from contexts.notifications.domain.notification.ports.notification_channel import Delivery


class NotificationHtmxPresenter:
    """What a live notification looks like in the HTMX front end: an out-of-band swap into #notifications."""

    def present(self, delivery: Delivery) -> str:
        return f'<div id="notifications" hx-swap-oob="innerHTML">{delivery.content}</div>'
