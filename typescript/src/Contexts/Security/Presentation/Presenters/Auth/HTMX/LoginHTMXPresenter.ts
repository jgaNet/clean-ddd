import { Presenter } from '@Architecture/Presentation/Presenter';
import { ErrorViewModel } from '@Contexts/Security/Presentation/Presenters/Auth/ViewModels';
import { html } from '@Architecture/Presentation/Html';

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
