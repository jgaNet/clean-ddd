import { Presenter } from '@SharedKernel/Presentation/Presenter';
import { AccountViewModel } from '@Contexts/Security/Presentation/Presenters/Auth/ViewModels';

export class MeJSONPresenter implements Presenter<AccountViewModel, object> {
  present(data: AccountViewModel): object {
    return {
      id: data.id,
      email: data.email,
      role: data.role,
      status: data.status,
      plan: data.plan,
      lastAuthenticatedAt: data.lastAuthenticatedAt,
    };
  }
}
