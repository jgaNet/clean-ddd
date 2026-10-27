package presentation

import (
	"fmt"
	"html"
	"net/http"
	"time"

	"clean-ddd/architecture/presentation"
	"clean-ddd/contexts/security/domain/account"
)

// The same use case answered in two formats; which one is decided per request from the
// headers. For the HTMX front end, "not signed in" is answered with the login form itself.

// accountView is what a read model looks like outside, in camelCase.
type accountView struct {
	ID                  string `json:"id"`
	Email               string `json:"email"`
	Role                string `json:"role"`
	Status              string `json:"status"`
	LastAuthenticatedAt string `json:"lastAuthenticatedAt,omitempty"`
}

func accountViewOf(detail account.Detail) accountView {
	view := accountView{ID: detail.ID, Email: detail.Email, Role: string(detail.Role), Status: string(detail.Status)}
	if detail.LastAuthenticatedAt != nil {
		view.LastAuthenticatedAt = detail.LastAuthenticatedAt.UTC().Format(time.RFC3339)
	}
	return view
}

type LoggedInJSONPresenter struct{}

func (LoggedInJSONPresenter) Present(w http.ResponseWriter, token string) {
	presentation.WriteJSON(w, http.StatusOK, map[string]string{"token": token})
}

// LoggedInHTMXPresenter: logged in, the page loads the account. The fragment carries the
// token, so a page served from another origin, where the cookie does not reach, can keep it
// and send it as a bearer.
type LoggedInHTMXPresenter struct{}

func (LoggedInHTMXPresenter) Present(w http.ResponseWriter, token string) {
	presentation.WriteHTML(w, http.StatusOK, fmt.Sprintf(
		`<div hx-get="/v1/auth/me" hx-trigger="load" hx-swap="innerHTML" hx-target="#app" data-token="%s"></div>`,
		html.EscapeString(token)))
}

type MeJSONPresenter struct{}

func (MeJSONPresenter) Present(w http.ResponseWriter, detail account.Detail) {
	presentation.WriteJSON(w, http.StatusOK, accountViewOf(detail))
}

type MeHTMXPresenter struct{}

func (MeHTMXPresenter) Present(w http.ResponseWriter, detail account.Detail) {
	presentation.WriteHTML(w, http.StatusOK, fmt.Sprintf(`
		<div ws-connect="/ws">
		  <div id="notifications"></div>
		  <div>
		    <h3>
		      Welcome %s
		      <button id="logout" hx-push-url="/" hx-post="/v1/auth/logout" hx-trigger="click" hx-ext="json-enc">
		        Logout
		      </button>
		    </h3>
		  </div>
		  <div
		    hx-get="/v1/notes/new" hx-trigger="load" hx-swap="outerHTML" hx-target="#new-note" id="new-note"
		  ></div>
		</div>
	`, html.EscapeString(detail.Email)))
}

// ErrorJSONPresenter answers { error } with the status it was built with.
type ErrorJSONPresenter struct{ Status int }

func (p ErrorJSONPresenter) Present(w http.ResponseWriter, message string) {
	presentation.WriteJSON(w, p.Status, map[string]string{"error": message})
}

// ErrorHTMXPresenter answers an alert fragment with the status it was built with.
type ErrorHTMXPresenter struct{ Status int }

func (p ErrorHTMXPresenter) Present(w http.ResponseWriter, message string) {
	presentation.WriteHTML(w, p.Status, fmt.Sprintf(`<div class="alert alert-danger" role="alert">%s</div>`, html.EscapeString(message)))
}

type LogoutJSONPresenter struct{}

func (LogoutJSONPresenter) Present(w http.ResponseWriter, message string) {
	presentation.WriteJSON(w, http.StatusOK, map[string]string{"message": message})
}

// LoginHTMXPresenter is the login form, with a message in its errors slot.
type LoginHTMXPresenter struct{}

func (LoginHTMXPresenter) Present(w http.ResponseWriter, message string) {
	presentation.WriteHTML(w, http.StatusOK, fmt.Sprintf(`
		<div>
		  <form
		    hx-push-url="/me"
		    hx-post="/v1/auth/login"
		    hx-ext="json-enc"
		    hx-target="#app"
		    hx-target-error="#errors"
		    hx-swap="innerHTML"
		  >
		    <input name="identifier" placeholder="Identifier" />
		    <input name="password" placeholder="Password" />
		    <input type="submit" value="Login" />
		  </form>
		  <br />
		  <div id="errors">%s</div>
		  <script>
		    history.pushState({}, '', '/');
		  </script>
		</div>
	`, html.EscapeString(message)))
}

var (
	// LoggedIn answers a login that succeeded: the token.
	LoggedIn = presentation.ByFormat[string]{JSON: LoggedInJSONPresenter{}, HTMX: LoggedInHTMXPresenter{}}
	// Me answers the caller's own account.
	Me = presentation.ByFormat[account.Detail]{JSON: MeJSONPresenter{}, HTMX: MeHTMXPresenter{}}
	// LoggedOut answers a logout: a message, or the login form again.
	LoggedOut = presentation.ByFormat[string]{JSON: LogoutJSONPresenter{}, HTMX: LoginHTMXPresenter{}}
	// SignInAgain answers an anonymous caller: HTMX swaps the login form back in (200), an API client gets a 401.
	SignInAgain = presentation.ByFormat[string]{JSON: ErrorJSONPresenter{Status: http.StatusUnauthorized}, HTMX: LoginHTMXPresenter{}}
)

// Error answers a refusal with the given status, as { error } or as an alert fragment.
func Error(status int) presentation.ByFormat[string] {
	return presentation.ByFormat[string]{JSON: ErrorJSONPresenter{Status: status}, HTMX: ErrorHTMXPresenter{Status: status}}
}
