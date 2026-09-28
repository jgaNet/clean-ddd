import { Presenter } from '@SharedKernel/Presentation/Presenter';
import { LoginViewModel } from '../ViewModels';

export class LoggedInJSONPresenter implements Presenter<LoginViewModel, object> {
  present(data: LoginViewModel): object {
    return {
      token: data.token,
    };
  }
}
