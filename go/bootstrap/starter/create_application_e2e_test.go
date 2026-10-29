package bootstrap

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

// How an end-to-end test boots the application: in this process, on a free port, with fresh
// in-memory stores, spoken to over HTTP as a client would; each test boots its own, and stops it
// afterwards. A context's cases go beside this file, as <context>_routes_e2e_test.go, and boot
// it with startTestApplication.

// startTestApplication serves the application on a free port and answers the base URL of its
// API (http://127.0.0.1:<port>/v1).
func startTestApplication(t *testing.T) string {
	t.Helper()
	server, err := Compose(Settings{Port: 0, APIPrefix: "v1"}, nil)
	if err != nil {
		t.Fatalf("the application could not be built: %v", err)
	}
	running, err := server.Start(0)
	if err != nil {
		t.Fatalf("the application could not listen: %v", err)
	}
	t.Cleanup(func() { _ = running.Stop() })
	return running.API
}

// get asks the API anonymously, with the headers given as name, value pairs.
func get(t *testing.T, url string, headers ...string) (*http.Response, map[string]any) {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i+1 < len(headers); i += 2 {
		request.Header.Set(headers[i], headers[i+1])
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer func() { _ = response.Body.Close() }()
	text, _ := io.ReadAll(response.Body)
	var body map[string]any
	_ = json.Unmarshal(text, &body)
	return response, body
}

func TestTheTrackerIsServedUnderThePrefixToAnAnonymousCallerWithTheTraceOfTheRequest(t *testing.T) {
	api := startTestApplication(t)
	traceID := "11111111-1111-4111-8111-111111111111"

	response, body := get(t, api+"/tracker/operations/00000000-0000-4000-8000-000000000000", "x-trace-id", traceID)

	// An operation is followed by whoever started it; nobody started this one, and an anonymous
	// caller is told to sign in rather than whether it exists.
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("status: %d", response.StatusCode)
	}
	if _, ok := body["message"].(string); !ok || len(body) != 1 {
		t.Fatalf("body: %v", body)
	}
	if response.Header.Get("x-trace-id") != traceID {
		t.Fatalf("trace: %q", response.Header.Get("x-trace-id"))
	}
}

func TestOperationsAreListedForAnAdministratorOnly(t *testing.T) {
	api := startTestApplication(t)

	if response, _ := get(t, api+"/tracker/operations"); response.StatusCode != http.StatusForbidden {
		t.Fatalf("status: %d", response.StatusCode)
	}
}
