import { Presenter } from '@SharedKernel/Domain/DDD';
import { HomeViewModel } from './DTOs';

export class HomeJsonPresenter implements Presenter<HomeViewModel, object> {
  present(data: HomeViewModel): object {
    return {
      name: data.name,
      version: data.version,
    };
  }
}
