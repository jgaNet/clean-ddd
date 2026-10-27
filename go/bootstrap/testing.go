package bootstrap

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"
)

// Boots the real application in this process, on a free port, with fresh in-memory stores,
// seeded with the administrator from the settings. Each end-to-end suite starts its own and
// stops it afterwards, so suites neither share state nor depend on their order. The tests still
// talk HTTP: what they prove is what a client would see. The end-to-end tests depend on this
// file and on net/http, and reach into no layer (ARCH-E2E).

// TestApplication is one running application and the clients that speak to it.
type TestApplication struct {
	t *testing.T
	// API is the base URL of the API of this instance, e.g. http://127.0.0.1:53210/v1.
	API string
	// Root is the base URL without the prefix.
	Root    string
	running *Running
}

// Client speaks HTTP to the application, as an anonymous caller or with a bearer token.
type Client struct {
	t     *testing.T
	api   string
	token string
	http  *http.Client
}

// Response is what a request answered: the status, the headers, the body, and the body as JSON.
type Response struct {
	Status int
	Header http.Header
	Text   string
	JSON   any
}

func StartTestApplication(t *testing.T) *TestApplication {
	t.Helper()
	app, err := CreateApplication(SettingsForTests(), nil)
	if err != nil {
		t.Fatalf("the application could not be built: %v", err)
	}
	running, err := app.Start(0)
	if err != nil {
		t.Fatalf("the application could not listen: %v", err)
	}
	t.Cleanup(func() { _ = running.Stop() })
	return &TestApplication{t: t, API: running.Address + "/v1", Root: running.Address, running: running}
}

func (a *TestApplication) Anonymous() *Client {
	return &Client{t: a.t, api: a.API, http: &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}

func (a *TestApplication) Login(identifier, password string) *Response {
	return a.Anonymous().Post("/auth/login", map[string]string{"identifier": identifier, "password": password})
}

// AgentAs is a client carrying the bearer token of that account.
func (a *TestApplication) AgentAs(identifier, password string) *Client {
	a.t.Helper()
	logged := a.Login(identifier, password)
	if logged.Status != http.StatusOK {
		a.t.Fatalf("login of %s answered %d: %s", identifier, logged.Status, logged.Text)
	}
	client := a.Anonymous()
	client.token = logged.Object()["token"].(string)
	return client
}

func (a *TestApplication) Admin() *Client { return a.AgentAs("admin@admin.fr", "admin") }

// Operation follows an accepted command to its outcome: the operation, once it is no longer
// pending. A client holding a 202 does the same; the dispatch runs after the answer (ADR 14).
func (a *TestApplication) Operation(client *Client, operationID string) map[string]any {
	a.t.Helper()
	for i := 0; i < 400; i++ {
		response := client.Get("/tracker/operations/" + operationID)
		if response.Status == http.StatusOK {
			operation := response.Object()
			if operation["status"] != "PENDING" {
				return operation
			}
		}
		time.Sleep(5 * time.Millisecond)
	}
	a.t.Fatalf("operation %s did not reach an outcome in time", operationID)
	return nil
}

// Accepted accepts a command and follows it: the operation at its outcome.
func (a *TestApplication) Accepted(client *Client, response *Response) map[string]any {
	a.t.Helper()
	if response.Status != http.StatusAccepted {
		a.t.Fatalf("expected 202, got %d: %s", response.Status, response.Text)
	}
	return a.Operation(client, response.Object()["operationId"].(string))
}

// SignUpValidated signs up a new account, validates it as the administrator, and returns its id: a fresh, usable user.
func (a *TestApplication) SignUpValidated(identifier, password string) string {
	a.t.Helper()
	admin := a.Admin()
	signedUp := a.Anonymous().Post("/auth/signup", map[string]string{"identifier": identifier, "password": password})
	accountID := a.Accepted(admin, signedUp)["result"].(string)
	a.Accepted(admin, admin.Get("/auth/accounts/"+accountID+"/validate"))
	return accountID
}

// Header is an extra request header, for the HTMX requests.
type Header struct{ Name, Value string }

var HTMX = Header{"HX-Request", "true"}

func (c *Client) Get(path string, headers ...Header) *Response {
	return c.send(http.MethodGet, path, nil, headers)
}

func (c *Client) Post(path string, body any, headers ...Header) *Response {
	return c.send(http.MethodPost, path, body, headers)
}

func (c *Client) Put(path string, body any, headers ...Header) *Response {
	return c.send(http.MethodPut, path, body, headers)
}

func (c *Client) Patch(path string, body any, headers ...Header) *Response {
	return c.send(http.MethodPatch, path, body, headers)
}

// Options sends a CORS preflight.
func (c *Client) Options(path string, headers ...Header) *Response {
	return c.send(http.MethodOptions, path, nil, headers)
}

func (c *Client) send(method, path string, body any, headers []Header) *Response {
	c.t.Helper()
	url := path
	if len(path) == 0 || path[0] == '/' {
		url = c.api + path
	}
	var payload io.Reader
	if body != nil {
		encoded, _ := json.Marshal(body)
		payload = bytes.NewReader(encoded)
	}
	request, err := http.NewRequest(method, url, payload)
	if err != nil {
		c.t.Fatalf("%v", err)
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		request.Header.Set("Authorization", "Bearer "+c.token)
	}
	for _, header := range headers {
		request.Header.Set(header.Name, header.Value)
	}
	response, err := c.http.Do(request)
	if err != nil {
		c.t.Fatalf("%s %s: %v", method, url, err)
	}
	defer func() { _ = response.Body.Close() }()
	text, _ := io.ReadAll(response.Body)
	result := &Response{Status: response.StatusCode, Header: response.Header, Text: string(text)}
	_ = json.Unmarshal(text, &result.JSON)
	return result
}

// Object is the body as a JSON object; a test that expects one fails otherwise.
func (r *Response) Object() map[string]any {
	object, ok := r.JSON.(map[string]any)
	if !ok {
		panic(fmt.Sprintf("not a JSON object: %s", r.Text))
	}
	return object
}

// Array is the body as a JSON array of objects.
func (r *Response) Array() []map[string]any {
	items, ok := r.JSON.([]any)
	if !ok {
		panic(fmt.Sprintf("not a JSON array: %s", r.Text))
	}
	objects := make([]map[string]any, 0, len(items))
	for _, item := range items {
		objects = append(objects, item.(map[string]any))
	}
	return objects
}
