import { Presenter } from '@SharedKernel/Domain/DDD';
import { html } from '@Contexts/@SharedKernel/Presentation/Templates';

export class NewNoteHTMXPresenter implements Presenter<void, string> {
  present(): string {
    return html`
      <form
        hx-post="/v1/notes"
        hx-ext="json-enc"
        hx-swap="none"
        hx-on::after-request="if(event.detail.successful) this.reset()"
      >
        <h2>Create a new Note</h2>
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
    `;
  }
}
