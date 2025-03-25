import { Presenter } from '@SharedKernel/Domain/DDD';
import { HomeViewModel } from './DTOs';

export class HomeHtmxPresenter implements Presenter<HomeViewModel, string> {
  present(data: HomeViewModel): string {
    return `
      <div class="container">
        <h1>${data.name}</h1>
        <p><b>Version:</b> ${data.version}</p>
      </div>
    `;
  }
}
