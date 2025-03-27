import { Presenter } from '@SharedKernel/Domain/DDD';
import { HomeViewModel } from './ViewModels';

export class HomeHtmxPresenter implements Presenter<HomeViewModel, string> {
  present(data: HomeViewModel): string {
    return `
      <main
        hx-trigger="load"
        hx-get="/v1/auth/me"
        hx-swap="innerHTML"
        hx-ext="response-targets"
        hx-target="#app"
      >
        <h1>${data.name}</h1>
        <p><b>Version:</b> ${data.version}</p>
        <div id="app"></div>
      </main>
  <script src="/js/htmx.min.js"></script>
  <script src="/js/ws.js"></script>
  <script src="/js/json-enc.js"></script>
  <script src="/js/response-targets.js"></script>
  <script src="/js/client-side-templates.js"></script>
  <script src="/js/nunjucks.min.js"></script>
  <script src="/js/init.js"></script>
    `;
  }
}
