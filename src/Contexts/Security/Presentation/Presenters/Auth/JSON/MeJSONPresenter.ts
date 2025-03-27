import { Presenter } from '@SharedKernel/Domain/DDD';
import { AccountViewModel } from '../ViewModels';

export class MeJSONPresenter implements Presenter<AccountViewModel, object> {
  present(data: AccountViewModel): object {
    return {
      subjectId: data.subjectId,
      subjectType: data.subjectType,
      isActive: data.isActive,
      lastAuthenticated: data.lastAuthenticated,
      credentials: data.credentials,
    };
  }
}
