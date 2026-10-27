package presentation

import (
	"encoding/json"
	"net/http"
	"strings"
)

// Format is one of the two ways this application answers: JSON for API clients, HTML fragments
// for the HTMX front end, decided per request from the HX-Request header.
type Format string

const (
	JSON Format = "json"
	HTMX Format = "htmx"
)

func FormatOf(headers http.Header) Format {
	if headers.Get("HX-Request") != "" {
		return HTMX
	}
	return JSON
}

// Presenter turns a view model into a response, in one format.
type Presenter[T any] interface {
	Present(w http.ResponseWriter, data T)
}

// ByFormat is one presenter per format for a given view model. JSON is mandatory (every use
// case has an API); HTMX is optional and falls back to JSON.
type ByFormat[T any] struct {
	JSON Presenter[T]
	HTMX Presenter[T]
}

func (p ByFormat[T]) Present(w http.ResponseWriter, format Format, data T) {
	if format == HTMX && p.HTMX != nil {
		p.HTMX.Present(w, data)
		return
	}
	p.JSON.Present(w, data)
}

// WriteJSON answers a value as JSON with a status.
func WriteJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// WriteHTML answers an HTML fragment with a status, its indentation removed.
func WriteHTML(w http.ResponseWriter, status int, fragment string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(Dedent(fragment)))
}

// Dedent strips the common leading indentation of a fragment written inline in Go source.
func Dedent(text string) string {
	lines := strings.Split(strings.Trim(text, "\n"), "\n")
	indent := -1
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		leading := len(line) - len(strings.TrimLeft(line, " \t"))
		if indent < 0 || leading < indent {
			indent = leading
		}
	}
	if indent <= 0 {
		return strings.TrimSpace(text)
	}
	for i, line := range lines {
		if len(line) >= indent {
			lines[i] = line[indent:]
		} else {
			lines[i] = strings.TrimLeft(line, " \t")
		}
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}
