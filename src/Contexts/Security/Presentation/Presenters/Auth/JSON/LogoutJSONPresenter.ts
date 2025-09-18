import { Presenter } from '@Core/Domain';
import { LogoutViewModel } from '../ViewModels';

export class LogoutJSONPresenter implements Presenter<LogoutViewModel, object> {
  present({ message }: LogoutViewModel): object {
    return {
      message,
    };
  }
}
