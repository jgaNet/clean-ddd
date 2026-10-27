package presentation

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

type jsonGreeting struct{}

func (jsonGreeting) Present(w http.ResponseWriter, data string) {
	WriteJSON(w, http.StatusOK, map[string]string{"greeting": data})
}

type htmxGreeting struct{}

func (htmxGreeting) Present(w http.ResponseWriter, data string) {
	WriteHTML(w, http.StatusOK, "<p>"+data+"</p>")
}

func TestReadsTheFormatFromTheHTMXHeader(t *testing.T) {
	headers := http.Header{}
	headers.Set("HX-Request", "true")
	if format := FormatOf(headers); format != HTMX {
		t.Errorf("with the header: got %s, want htmx", format)
	}
	if format := FormatOf(http.Header{}); format != JSON {
		t.Errorf("without the header: got %s, want json", format)
	}
}

func TestFallsBackOnJSONWhenAUseCaseHasNoHTMXPresenter(t *testing.T) {
	both := ByFormat[string]{JSON: jsonGreeting{}, HTMX: htmxGreeting{}}
	onlyJSON := ByFormat[string]{JSON: jsonGreeting{}}

	recorder := httptest.NewRecorder()
	both.Present(recorder, HTMX, "hi")
	if body := recorder.Body.String(); body != "<p>hi</p>" {
		t.Errorf("both, htmx: got %q", body)
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "text/html; charset=utf-8" {
		t.Errorf("both, htmx: content type %q", contentType)
	}

	recorder = httptest.NewRecorder()
	onlyJSON.Present(recorder, HTMX, "hi")
	if contentType := recorder.Header().Get("Content-Type"); contentType != "application/json; charset=utf-8" {
		t.Errorf("only json, htmx: content type %q", contentType)
	}
	if body := recorder.Body.String(); body != "{\"greeting\":\"hi\"}\n" {
		t.Errorf("only json, htmx: got %q", body)
	}

	recorder = httptest.NewRecorder()
	both.Present(recorder, JSON, "hi")
	if body := recorder.Body.String(); body != "{\"greeting\":\"hi\"}\n" {
		t.Errorf("both, json: got %q", body)
	}
}

func TestWriteJSONAnswersTheStatusItIsGiven(t *testing.T) {
	recorder := httptest.NewRecorder()
	WriteJSON(recorder, http.StatusAccepted, map[string]string{"operationId": "op-1"})
	if recorder.Code != http.StatusAccepted {
		t.Errorf("status: got %d", recorder.Code)
	}
	if body := recorder.Body.String(); body != "{\"operationId\":\"op-1\"}\n" {
		t.Errorf("body: got %q", body)
	}
}

func TestDedentStripsTheCommonIndentationOfAFragment(t *testing.T) {
	fragment := `
		<form>
		  <input />
		</form>
	`
	if got := Dedent(fragment); got != "<form>\n  <input />\n</form>" {
		t.Errorf("Dedent: got %q", got)
	}
	if got := Dedent("plain"); got != "plain" {
		t.Errorf("a flat fragment is trimmed only: got %q", got)
	}
	if got := Dedent("  a\n\n    b"); got != "a\n\n  b" {
		t.Errorf("a blank line does not count: got %q", got)
	}
}
