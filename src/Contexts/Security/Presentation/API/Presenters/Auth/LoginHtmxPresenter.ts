import { Presenter } from '@SharedKernel/Domain/DDD';
import { LoginViewModel } from './ViewModels';

export class LoginHtmxPresenter implements Presenter<LoginViewModel, string> {
  present(_: LoginViewModel): string {
    return `
      <div hx-get="/v1/auth/me" hx-trigger="load" hx-swap="innerHTML" hx-target="#app"></div>
    `;
  }
}
