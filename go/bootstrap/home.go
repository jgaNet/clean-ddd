package bootstrap

import (
	"fmt"
	"net/http"
	"time"

	"clean-ddd/architecture/presentation"
)

// The home of the API, in two formats: { name, version } for an API client, the page shell for
// the HTMX front end, which then loads the account. The one controller the composition root
// owns, with its presenters beside it; and the health check.

type HomeViewModel struct {
	Name    string
	Version string
}

type homeJSONPresenter struct{}

func (homeJSONPresenter) Present(w http.ResponseWriter, data HomeViewModel) {
	presentation.WriteJSON(w, http.StatusOK, map[string]string{"name": data.Name, "version": data.Version})
}

type homeHTMXPresenter struct{}

func (homeHTMXPresenter) Present(w http.ResponseWriter, data HomeViewModel) {
	presentation.WriteHTML(w, http.StatusOK, fmt.Sprintf(`
		<main
		  hx-trigger="load" hx-get="/v1/auth/me" hx-swap="innerHTML" hx-ext="response-targets,ws" hx-target="#app"
		>
		  <h1>%s</h1>
		  <p><b>Version:</b> %s</p>
		  <div id="app"></div>
		</main>
	`, data.Name, data.Version))
}

var homePresenters = presentation.ByFormat[HomeViewModel]{JSON: homeJSONPresenter{}, HTMX: homeHTMXPresenter{}}

// homeRoutes registers the home and the health check under the API prefix. The page asks for
// `/v1/`: the same answer as `/v1`, not a redirect.
func homeRoutes(mux *http.ServeMux, prefix string, home HomeViewModel) {
	answer := func(w http.ResponseWriter, r *http.Request) {
		homePresenters.Present(w, presentation.FormatOf(r.Header), home)
	}
	mux.HandleFunc("GET "+prefix, answer)
	mux.HandleFunc("GET "+prefix+"/{$}", answer)
	mux.HandleFunc("GET "+prefix+"/health", func(w http.ResponseWriter, _ *http.Request) {
		presentation.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok", "timestamp": time.Now().UTC().Format(time.RFC3339Nano)})
	})
}
