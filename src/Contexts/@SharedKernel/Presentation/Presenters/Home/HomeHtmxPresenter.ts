import { Presenter } from '@SharedKernel/Domain/DDD';
import { HomeViewModel } from './ViewModels';

export class HomeHtmxPresenter implements Presenter<HomeViewModel, string> {
  present(data: HomeViewModel): string {
    return `
      <div class="container">
        <h1>${data.name}</h1>
        <p><b>Version:</b> ${data.version}</p>
        <p>
          <form hx-post="/v1/notes" hx-ext="json-enc">
            <p>
              <label for="title">Title</label>
              <br />
              <input type="text" name="title" id="title" />
            </p>
            <p>
              <label for="body">Body</label>
              <br />
              <textarea rows="5" cols="50" name="content" id="content"></textarea>
            </p>
            <input type="submit" value="Submit" />
          </form>
        <p>
      </div>
    `;
  }
}
