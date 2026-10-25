import { Presenter } from '@Architecture/Presentation/Presenter';
import { LoginViewModel } from '@Contexts/Security/Presentation/Presenters/Auth/ViewModels';
import { html } from '@Architecture/Presentation/Html';

/**
 * Logged in: the page loads the account. The fragment carries the token, so a page served from
 * another origin, where the cookie does not reach, can keep it and send it as a bearer.
 */
export class LoggedInHTMXPresenter implements Presenter<LoginViewModel, string> {
  present({ token }: LoginViewModel): string {
    return html`
      <div hx-get="/v1/auth/me" hx-trigger="load" hx-swap="innerHTML" hx-target="#app" data-token="${token}"></div>
    `;
  }
}
