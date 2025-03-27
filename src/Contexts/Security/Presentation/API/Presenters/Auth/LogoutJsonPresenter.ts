import { Presenter } from '@SharedKernel/Domain/DDD';
import { LogoutViewModel } from './ViewModels';

export class LogoutJsonPresenter implements Presenter<LogoutViewModel, object> {
  present(data: LogoutViewModel): object {
    return {
      success: data.success,
    };
  }
}
