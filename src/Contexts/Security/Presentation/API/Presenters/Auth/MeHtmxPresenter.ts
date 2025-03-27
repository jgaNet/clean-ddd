import { Presenter } from '@SharedKernel/Domain/DDD';
import { AccountViewModel } from './ViewModels';

export class MeHtmxPresenter implements Presenter<AccountViewModel, string> {
  present(data: AccountViewModel): string {
    return `
      <div ws-connect="/ws" hx-ext="ws">
         ${data.subjectId}
         <button id="logout" hx-push-url="/"  hx-post="/v1/auth/logout" hx-trigger="click" hx-ext="json-enc">Logout</button>
      </div>
    `;
  }
}
