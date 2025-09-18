import { Presenter } from '@Core/Domain';
import { ErrorViewModel } from '../ViewModels';
import { html } from '@Core/Infrastructure/Templates';

export class ErrorHTMXPresenter implements Presenter<ErrorViewModel, string> {
  present({ message }: ErrorViewModel): string {
    return html`<div class="alert alert-danger" role="alert">${message}</div>`;
  }
}
