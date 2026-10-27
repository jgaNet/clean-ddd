package presentation

import (
	"net/http"

	"clean-ddd/architecture/presentation"
)

// NewNoteHTMXPresenter is the form the HTMX front end loads to write a note.
type NewNoteHTMXPresenter struct{}

func (NewNoteHTMXPresenter) Present(w http.ResponseWriter, _ struct{}) {
	presentation.WriteHTML(w, http.StatusOK, `
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
	`)
}
