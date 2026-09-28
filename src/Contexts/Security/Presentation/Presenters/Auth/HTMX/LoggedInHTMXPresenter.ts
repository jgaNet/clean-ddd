import { Presenter } from '@SharedKernel/Presentation/Presenter';
import { html } from '@SharedKernel/Presentation/Templates';

export class LoggedInHTMXPresenter implements Presenter<void, string> {
  present(_: never): string {
    return html` <div hx-get="/v1/auth/me" hx-trigger="load" hx-swap="innerHTML" hx-target="#app"></div> `;
  }
}
