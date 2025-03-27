import { Presenter } from '@SharedKernel/Domain/DDD';

export class LoggedInHTMXPresenter implements Presenter<void, string> {
  present(_: never): string {
    return `
      <div hx-get="/v1/auth/me" hx-trigger="load" hx-swap="innerHTML" hx-target="#app"></div>
    `;
  }
}
