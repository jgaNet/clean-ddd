import { Presenter } from '@SharedKernel/Domain/DDD';
import { ErrorViewModel } from './ViewModels';

export class ErrorJsonPresenter implements Presenter<ErrorViewModel, object> {
  present(message: ErrorViewModel): object {
    return {
      error: message,
    };
  }
}
