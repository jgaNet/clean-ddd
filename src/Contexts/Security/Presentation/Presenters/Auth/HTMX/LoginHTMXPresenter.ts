import { Presenter } from '@Core/Domain';
import { ErrorViewModel } from '../ViewModels';
import { html } from '@Core/Infrastructure/Templates';

export class LoginHTMXPresenter implements Presenter<ErrorViewModel, string> {
  present({ message }: ErrorViewModel): string {
    return html`
      <div>
        <form
          hx-push-url="/me"
          hx-post="v1/auth/login"
          hx-ext="json-enc"
          hx-target="#app"
          hx-target-error="#errors"
          hx-swap="innerHTML"
        >
          <input name="identifier" placeholder="Identifier" />
          <input name="password" placeholder="Password" />
          <input type="submit" value="Login" />
        </form>
        <br />
        <div id="errors">${message}</div>
        <script>
          history.pushState({}, '', '/');
        </script>
      </div>
    `;
  }
}
