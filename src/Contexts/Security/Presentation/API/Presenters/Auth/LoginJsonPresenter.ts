import { Presenter } from '@SharedKernel/Domain/DDD';
import { LoginViewModel } from './ViewModels';

export class LoginJsonPresenter implements Presenter<LoginViewModel, object> {
  present(data: LoginViewModel): object {
    return {
      token: data.token,
    };
  }
}
