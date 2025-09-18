import { Presenter } from '@Core/Domain';
import { HomeViewModel } from './ViewModels';

export class HomeJsonPresenter implements Presenter<HomeViewModel, object> {
  present(data: HomeViewModel): object {
    return {
      name: data.name,
      version: data.version,
    };
  }
}
