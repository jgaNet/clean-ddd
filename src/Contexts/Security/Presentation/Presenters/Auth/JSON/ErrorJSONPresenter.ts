import { Presenter } from '@SharedKernel/Presentation/Presenter';
import { ErrorViewModel } from '@Contexts/Security/Presentation/Presenters/Auth/ViewModels';

export class ErrorJSONPresenter implements Presenter<ErrorViewModel, object> {
  present({ message }: ErrorViewModel): object {
    return { error: message };
  }
}
