import { Presenter } from '@SharedKernel/Domain/DDD';
import { AccountViewModel } from '../ViewModels';
import { html } from '@Contexts/@SharedKernel/Presentation/Templates';

export class MeHTMXPresenter implements Presenter<AccountViewModel, string> {
  present(data: AccountViewModel): string {
    return html`
      <div ws-connect="/ws">
        <div id="notifications"></div>
        <div>
          <h3>
            Welcome ${data.subjectId}
            <button id="logout" hx-push-url="/" hx-post="/v1/auth/logout" hx-trigger="click" hx-ext="json-enc">
              Logout
            </button>
          </h3>
        </div>
        <div hx-get="/v1/notes/new" hx-trigger="load" hx-swap="outerHTML" hx-target="#new-note" id="new-note"></div>
      </div>
    `;
  }
}
