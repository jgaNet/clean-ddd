import { Presenter } from '@Architecture/Presentation/Presenter';
import { ErrorViewModel } from '@Contexts/Security/Presentation/Presenters/Auth/ViewModels';
import { html } from '@Architecture/Presentation/Html';

export class ErrorHTMXPresenter implements Presenter<ErrorViewModel, string> {
  present({ message }: ErrorViewModel): string {
    return html`<div class="alert alert-danger" role="alert">${message}</div>`;
  }
}
