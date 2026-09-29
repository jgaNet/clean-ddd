import { Presenter } from '@Architecture/Presentation/Presenter';
import { LoginViewModel } from '@Contexts/Security/Presentation/Presenters/Auth/ViewModels';

export class LoggedInJSONPresenter implements Presenter<LoginViewModel, object> {
  present(data: LoginViewModel): object {
    return {
      token: data.token,
    };
  }
}
