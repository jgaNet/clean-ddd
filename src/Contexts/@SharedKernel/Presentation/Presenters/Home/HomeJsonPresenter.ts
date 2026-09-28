import { Presenter } from '@SharedKernel/Presentation/Presenter';
import { HomeViewModel } from './ViewModels';

export class HomeJsonPresenter implements Presenter<HomeViewModel, object> {
  present(data: HomeViewModel): object {
    return {
      name: data.name,
      version: data.version,
    };
  }
}
