import { Presenter } from '@SharedKernel/Domain/DDD';
import { ErrorViewModel } from './ViewModels';

export class NotAllowedHtmxPresenter implements Presenter<ErrorViewModel, string> {
  present(message: ErrorViewModel): string {
    return `
      <div>
        <form
            hx-push-url="/me"
            hx-post="v1/auth/login"
            hx-ext="json-enc"
            hx-target="#app"
            hx-target-error="#errors"
            hx-swap="innerHTML">
          <input name="identifier" placeholder="Identifier"/>
          <input name="password" placeholder="Password"/>
          <input type="submit" value="Login"/>
        </form>
        <div id="errors">${message}</div>
        <script>
          history.pushState({}, '', '/');
        </script>
      </div>
    `;
  }
}
