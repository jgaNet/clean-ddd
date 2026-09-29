import { Presenter } from '@SharedKernel/Presentation/Presenter';
import { ErrorViewModel } from '@Contexts/Security/Presentation/Presenters/Auth/ViewModels';
import { html } from '@SharedKernel/Presentation/Templates';

export class ErrorHTMXPresenter implements Presenter<ErrorViewModel, string> {
  present({ message }: ErrorViewModel): string {
    return html`<div class="alert alert-danger" role="alert">${message}</div>`;
  }
}
