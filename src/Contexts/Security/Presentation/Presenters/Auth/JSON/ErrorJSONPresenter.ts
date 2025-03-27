import { Presenter } from '@SharedKernel/Domain/DDD';
import { ErrorViewModel } from '../ViewModels';

export class ErrorJSONPresenter implements Presenter<ErrorViewModel, object> {
  present(message: ErrorViewModel): object {
    return {
      error: message,
    };
  }
}
