import { Presenter } from '@SharedKernel/Presentation/Presenter';
import { html } from '@SharedKernel/Presentation/Templates';

import { Delivery } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationChannel';

/** What a live notification looks like in the HTMX front end: an out-of-band swap into #notifications. */
export class NotificationHTMXPresenter implements Presenter<Delivery, string> {
  present(delivery: Delivery): string {
    return html`<div id="notifications" hx-swap-oob="innerHTML">${delivery.content}</div>`;
  }
}
