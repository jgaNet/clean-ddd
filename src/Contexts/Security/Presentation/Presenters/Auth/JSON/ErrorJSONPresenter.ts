import { Presenter } from '@SharedKernel/Presentation/Presenter';
import { ErrorViewModel } from '../ViewModels';

export class ErrorJSONPresenter implements Presenter<ErrorViewModel, object> {
  present({ message }: ErrorViewModel): object {
    return { error: message };
  }
}
