import { Presenter } from '@SharedKernel/Domain/DDD';
import { ErrorViewModel } from '../ViewModels';

export class ErrorHTMXPresenter implements Presenter<ErrorViewModel, string> {
  present(message: ErrorViewModel): string {
    return `<div class="alert alert-danger" role="alert">${message}</div>`;
  }
}
