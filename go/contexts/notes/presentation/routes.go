package presentation

import (
	"net/http"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/presentation"
	"clean-ddd/contexts/notes/application/commands"
	"clean-ddd/contexts/notes/application/queries"
	"clean-ddd/contexts/notes/domain/note"
)

// The verb follows the HTTP grammar (yarn architecture verbs): POST /notes creates,
// PUT /notes/{id} replaces, POST /notes/{id}/share acts; an action undone is a second act
// named after the undoing (/archive and /restore, /pin and /unpin), never a DELETE.

type createNoteBody struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

// The same shape today, its own type on purpose: what one command accepts must not leak into the other.
type editNoteBody struct {
	Title   string `json:"title"`
	Content string `json:"content"`
}

type shareNoteBody struct {
	RecipientID string `json:"recipientId"`
}

// The views: what a read model looks like outside, in camelCase.

type listItemView struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
	Pinned bool   `json:"pinned"`
}

type detailView struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Status     string   `json:"status"`
	Pinned     bool     `json:"pinned"`
	OwnerID    string   `json:"ownerId"`
	Content    string   `json:"content"`
	SharedWith []string `json:"sharedWith"`
}

type sharedItemView struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Content string `json:"content"`
	OwnerID string `json:"ownerId"`
}

func listItemViews(items []note.ListItem) []listItemView {
	views := make([]listItemView, 0, len(items))
	for _, item := range items {
		views = append(views, listItemView{ID: item.ID, Title: item.Title, Status: string(item.Status), Pinned: item.Pinned})
	}
	return views
}

func detailViewOf(n note.Detail) detailView {
	shared := n.SharedWith
	if shared == nil {
		shared = []string{}
	}
	return detailView{ID: n.ID, Title: n.Title, Status: string(n.Status), Pinned: n.Pinned, OwnerID: n.OwnerID, Content: n.Content, SharedWith: shared}
}

func sharedItemViews(items []note.SharedListItem) []sharedItemView {
	views := make([]sharedItemView, 0, len(items))
	for _, item := range items {
		views = append(views, sharedItemView{ID: item.ID, Title: item.Title, Content: item.Content, OwnerID: item.OwnerID})
	}
	return views
}

func refuseNote(w http.ResponseWriter, err error) {
	status := presentation.StatusOf(err)
	if exception, ok := domain.Refusal(err); ok && exception.Type == "NoteNotFound" {
		status = http.StatusNotFound
	}
	presentation.Refuse(w, err, status)
}

// Routes registers the context's routes under prefix (/v1/notes) on the application's mux.
func Routes(mux *http.ServeMux, prefix string, module *application.Module) {
	newNoteForm := NewNoteHTMXPresenter{}

	mux.HandleFunc("POST "+prefix, func(w http.ResponseWriter, r *http.Request) {
		var body createNoteBody
		if !presentation.DecodeBody(w, r, &body) {
			return
		}
		presentation.Accept(w, presentation.ContextOf(r), commands.CreateNoteCommandEvent{Title: body.Title, Content: body.Content})
	})

	mux.HandleFunc("GET "+prefix, func(w http.ResponseWriter, r *http.Request) {
		ctx := presentation.ContextOf(r)
		items, err := application.Query(application.QueryOf[*queries.GetMyNotesHandler](module), application.NoParams{}, ctx)
		if err != nil {
			refuseNote(w, err)
			return
		}
		presentation.WriteJSON(w, http.StatusOK, listItemViews(items))
	})

	mux.HandleFunc("GET "+prefix+"/shared", func(w http.ResponseWriter, r *http.Request) {
		ctx := presentation.ContextOf(r)
		items, err := application.Query(application.QueryOf[*queries.GetNotesSharedWithMeHandler](module), application.NoParams{}, ctx)
		if err != nil {
			refuseNote(w, err)
			return
		}
		presentation.WriteJSON(w, http.StatusOK, sharedItemViews(items))
	})

	mux.HandleFunc("GET "+prefix+"/new", func(w http.ResponseWriter, r *http.Request) {
		newNoteForm.Present(w, struct{}{})
	})

	mux.HandleFunc("GET "+prefix+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		ctx := presentation.ContextOf(r)
		detail, err := application.Query(application.QueryOf[*queries.GetNoteHandler](module), r.PathValue("id"), ctx)
		if err != nil {
			refuseNote(w, err)
			return
		}
		presentation.WriteJSON(w, http.StatusOK, detailViewOf(detail))
	})

	mux.HandleFunc("PUT "+prefix+"/{id}", func(w http.ResponseWriter, r *http.Request) {
		var body editNoteBody
		if !presentation.DecodeBody(w, r, &body) {
			return
		}
		presentation.Accept(w, presentation.ContextOf(r), commands.EditNoteCommandEvent{NoteID: r.PathValue("id"), Title: body.Title, Content: body.Content})
	})

	mux.HandleFunc("POST "+prefix+"/{id}/archive", func(w http.ResponseWriter, r *http.Request) {
		presentation.Accept(w, presentation.ContextOf(r), commands.ArchiveNoteCommandEvent{NoteID: r.PathValue("id")})
	})

	mux.HandleFunc("POST "+prefix+"/{id}/restore", func(w http.ResponseWriter, r *http.Request) {
		presentation.Accept(w, presentation.ContextOf(r), commands.RestoreNoteCommandEvent{NoteID: r.PathValue("id")})
	})

	mux.HandleFunc("POST "+prefix+"/{id}/pin", func(w http.ResponseWriter, r *http.Request) {
		presentation.Accept(w, presentation.ContextOf(r), commands.PinNoteCommandEvent{NoteID: r.PathValue("id")})
	})

	mux.HandleFunc("POST "+prefix+"/{id}/unpin", func(w http.ResponseWriter, r *http.Request) {
		presentation.Accept(w, presentation.ContextOf(r), commands.UnpinNoteCommandEvent{NoteID: r.PathValue("id")})
	})

	mux.HandleFunc("POST "+prefix+"/{id}/share", func(w http.ResponseWriter, r *http.Request) {
		var body shareNoteBody
		if !presentation.DecodeBody(w, r, &body) {
			return
		}
		presentation.Accept(w, presentation.ContextOf(r), commands.ShareNoteCommandEvent{NoteID: r.PathValue("id"), RecipientID: body.RecipientID})
	})

	mux.HandleFunc("POST "+prefix+"/{id}/suggest-title", func(w http.ResponseWriter, r *http.Request) {
		presentation.Accept(w, presentation.ContextOf(r), commands.SuggestNoteTitleCommandEvent{NoteID: r.PathValue("id")})
	})
}
