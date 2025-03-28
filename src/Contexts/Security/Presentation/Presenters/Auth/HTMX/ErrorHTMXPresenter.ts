import { Presenter } from '@SharedKernel/Domain/DDD';
import { ErrorViewModel } from '../ViewModels';
import { html } from '@Contexts/@SharedKernel/Presentation/Templates';

export class ErrorHTMXPresenter implements Presenter<ErrorViewModel, string> {
  present({ message }: ErrorViewModel): string {
    return html`<div class="alert alert-danger" role="alert">${message}</div>`;
  }
}
