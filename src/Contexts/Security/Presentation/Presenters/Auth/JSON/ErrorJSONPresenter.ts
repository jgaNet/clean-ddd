import { Presenter } from '@Core/Domain';
import { ErrorViewModel } from '../ViewModels';

export class ErrorJSONPresenter implements Presenter<ErrorViewModel, object> {
  present(message: ErrorViewModel): object {
    return {
      error: message,
    };
  }
}
