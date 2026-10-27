package bootstrap

import (
	"net/http"
	"strings"
	"testing"
)

// The home of the API, end to end: the same route in two formats, the fragments the HTMX front
// end loads, and what a front end served from another origin needs (CORS).

func TestTheHomeAnswersJSONToAClientAndThePageShellToHTMX(t *testing.T) {
	app := StartTestApplication(t)
	client := app.Anonymous()

	home := client.Get("")
	if home.Status != http.StatusOK || home.Object()["name"] != Name || home.Object()["version"] != Version {
		t.Fatalf("home: %d %s", home.Status, home.Text)
	}
	slash := client.Get("/")
	if slash.Status != http.StatusOK || slash.Object()["name"] != Name {
		t.Fatalf("GET /v1/: %d %s", slash.Status, slash.Text)
	}

	shell := client.Get("", HTMX)
	if shell.Status != http.StatusOK || !strings.HasPrefix(shell.Header.Get("Content-Type"), "text/html") {
		t.Fatalf("shell: %d %s", shell.Status, shell.Header.Get("Content-Type"))
	}
	if !strings.Contains(shell.Text, "<main") || !strings.Contains(shell.Text, "<h1>clean-ddd</h1>") {
		t.Fatalf("shell: %s", shell.Text)
	}

	health := client.Get("/health")
	if health.Object()["status"] != "ok" {
		t.Fatalf("health: %s", health.Text)
	}
}

func TestTheAPISpeaksHTMXToTheFrontEndAndServesNoPage(t *testing.T) {
	app := StartTestApplication(t)
	client := app.Anonymous()

	// The front end is served elsewhere: the API has no page and no scripts
	if client.Get(app.Root+"/me").Status != http.StatusNotFound || client.Get(app.Root+"/js/htmx.min.js").Status != http.StatusNotFound {
		t.Fatal("the API should serve no page")
	}

	// Not signed in: HTMX gets the login form, an API client a 401
	form := client.Get("/auth/me", HTMX)
	if form.Status != http.StatusOK || !strings.Contains(form.Text, `hx-post="/v1/auth/login"`) {
		t.Fatalf("login form: %d %s", form.Status, form.Text)
	}
	if client.Get("/auth/me").Status != http.StatusUnauthorized {
		t.Fatal("an API client is told 401")
	}

	// Logged in through the form: the fragment that loads the account, with the cookie and the token
	credentials := map[string]string{"identifier": "admin@admin.fr", "password": "admin"}
	loggedIn := client.Post("/auth/login", credentials, HTMX)
	if loggedIn.Status != http.StatusOK || loggedIn.Header.Get("Set-Cookie") == "" {
		t.Fatalf("login through the form: %d", loggedIn.Status)
	}
	if !strings.Contains(loggedIn.Text, `hx-get="/v1/auth/me"`) || !strings.Contains(loggedIn.Text, `data-token="`) {
		t.Fatalf("fragment: %s", loggedIn.Text)
	}
	refused := client.Post("/auth/login", map[string]string{"identifier": "admin@admin.fr", "password": "nope"}, HTMX)
	if refused.Status != http.StatusUnauthorized || !strings.Contains(refused.Text, "alert") {
		t.Fatalf("refused: %d %s", refused.Status, refused.Text)
	}

	// The account page and the new-note form, as the front end loads them
	admin := app.Admin()
	if me := admin.Get("/auth/me", HTMX); !strings.Contains(me.Text, "Welcome admin@admin.fr") {
		t.Fatalf("me: %s", me.Text)
	}
	if form := admin.Get("/notes/new", HTMX); !strings.Contains(form.Text, `hx-post="/v1/notes"`) {
		t.Fatalf("new note form: %s", form.Text)
	}
	if logout := admin.Post("/auth/logout", nil, HTMX); !strings.Contains(logout.Text, "Login") {
		t.Fatalf("logout: %s", logout.Text)
	}
}

func TestAFrontEndOnAnAllowedOriginMayCallTheAPI(t *testing.T) {
	app := StartTestApplication(t)
	client := app.Anonymous()

	preflight := client.Options("/auth/login",
		Header{"Origin", "http://web.test"},
		Header{"Access-Control-Request-Method", "POST"},
		Header{"Access-Control-Request-Headers", "authorization,content-type,hx-request"})
	if preflight.Status != http.StatusOK && preflight.Status != http.StatusNoContent {
		t.Fatalf("preflight: %d", preflight.Status)
	}
	if preflight.Header.Get("Access-Control-Allow-Origin") != "http://web.test" {
		t.Fatalf("allow-origin: %q", preflight.Header.Get("Access-Control-Allow-Origin"))
	}
	if !strings.Contains(strings.ToLower(preflight.Header.Get("Access-Control-Allow-Headers")), "authorization") {
		t.Fatalf("allow-headers: %q", preflight.Header.Get("Access-Control-Allow-Headers"))
	}

	answer := client.Get("/health", Header{"Origin", "http://web.test"})
	if answer.Header.Get("Access-Control-Allow-Origin") != "http://web.test" {
		t.Fatal("an answer carries the origin")
	}
	if !strings.Contains(strings.ToLower(answer.Header.Get("Access-Control-Expose-Headers")), "x-trace-id") {
		t.Fatal("x-trace-id is exposed")
	}

	other := client.Get("/health", Header{"Origin", "http://evil.example"})
	if other.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("an unknown origin is not allowed")
	}
}
