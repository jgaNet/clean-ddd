package presentation_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/presentation"
	trackerapp "clean-ddd/contexts/tracker/application"
	"clean-ddd/contexts/tracker/application/queries"
	trackerpres "clean-ddd/contexts/tracker/presentation"
)

const prefix = "/v1/tracker/operations"

// records is the port over a slice: the routes are tested against the view they answer.
type records struct {
	items []trackerapp.Record
}

func (r *records) Save(record trackerapp.Record) error {
	r.items = append(r.items, record)
	return nil
}

func (r *records) FindByID(id string) (*trackerapp.Record, error) {
	for _, item := range r.items {
		if item.ID == id {
			return &item, nil
		}
	}
	return nil, nil
}

func (r *records) FindAll() ([]trackerapp.Record, error) { return r.items, nil }

func (r *records) FindByTrace(traceID string) ([]trackerapp.Record, error) {
	found := []trackerapp.Record{}
	for _, item := range r.items {
		if item.TraceID == traceID {
			found = append(found, item)
		}
	}
	return found, nil
}

var createdAt = time.Date(2026, 10, 27, 9, 30, 0, 123456789, time.UTC)

func serve(t *testing.T, store trackerapp.Records, method, target, subjectID, role string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	module := &application.Module{Name: "Tracker", Queries: []any{queries.NewGetOperationsHandler(store), queries.NewGetOperationHandler(store)}}
	trackerpres.Routes(mux, prefix, module)
	ctx := application.NewExecutionContext(application.Options{TraceID: "trace-1", Auth: application.Auth{SubjectID: subjectID, Role: role}})
	request := presentation.WithContext(httptest.NewRequest(method, target, nil), ctx)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	return response
}

func decode(t *testing.T, response *httptest.ResponseRecorder, into any) {
	t.Helper()
	if err := json.Unmarshal(response.Body.Bytes(), into); err != nil {
		t.Fatalf("not JSON: %s", response.Body.String())
	}
}

func TestAnsweredOperationInClientWordsWithoutWhatIsNotThereYet(t *testing.T) {
	store := &records{items: []trackerapp.Record{
		{ID: "op-1", Name: "CreateNote", Status: application.StatusPending, TraceID: "trace-1", CreatedAt: createdAt},
	}}

	response := serve(t, store, http.MethodGet, prefix+"/op-1", "root", "ADMIN")
	if response.Code != http.StatusOK {
		t.Fatalf("status %d: %s", response.Code, response.Body.String())
	}
	var view map[string]any
	decode(t, response, &view)
	want := map[string]any{"id": "op-1", "name": "CreateNote", "status": "PENDING", "traceId": "trace-1", "createdAt": "2026-10-27T09:30:00.123456789Z"}
	if len(view) != len(want) {
		t.Fatalf("view %v, want exactly %v", view, want)
	}
	for key, value := range want {
		if view[key] != value {
			t.Fatalf("%s = %v, want %v", key, view[key], value)
		}
	}
}

func TestAnsweredOutcomeIsFlattenedIntoResultOrError(t *testing.T) {
	finishedAt := createdAt.Add(time.Second)
	store := &records{items: []trackerapp.Record{
		{ID: "op-1", Name: "CreateNote", Status: application.StatusSuccess, TraceID: "trace-1", SubjectID: "alice", Result: "note-42", CreatedAt: createdAt, FinishedAt: &finishedAt},
		{ID: "op-2", Name: "ShareNote", Status: application.StatusError, TraceID: "trace-1", SubjectID: "alice", Error: &trackerapp.OperationError{Type: "NoteNotFound", Message: "Note not found"}, CreatedAt: createdAt, FinishedAt: &finishedAt},
	}}

	var success, failure map[string]any
	decode(t, serve(t, store, http.MethodGet, prefix+"/op-1", "alice", "USER"), &success)
	decode(t, serve(t, store, http.MethodGet, prefix+"/op-2", "alice", "USER"), &failure)

	if success["result"] != "note-42" || success["subjectId"] != "alice" || success["finishedAt"] != "2026-10-27T09:30:01.123456789Z" || success["error"] != nil {
		t.Fatalf("unexpected success view: %v", success)
	}
	wantError := map[string]any{"type": "NoteNotFound", "message": "Note not found"}
	if got, ok := failure["error"].(map[string]any); !ok || got["type"] != wantError["type"] || got["message"] != wantError["message"] {
		t.Fatalf("unexpected error view: %v", failure)
	}
	if _, has := failure["result"]; has {
		t.Fatalf("a failed operation has no result: %v", failure)
	}
	for _, key := range []string{"context", "payload"} {
		if _, has := success[key]; has {
			t.Fatalf("the view must not carry %s: %v", key, success)
		}
	}
}

func TestListsForAnAdministratorByTraceWhenAskedAndRefusesTheOthers(t *testing.T) {
	store := &records{items: []trackerapp.Record{
		{ID: "op-1", Name: "CreateNote", Status: application.StatusSuccess, TraceID: "trace-1", SubjectID: "alice", CreatedAt: createdAt},
		{ID: "op-2", Name: "ShareNote", Status: application.StatusError, TraceID: "trace-2", SubjectID: "bob", CreatedAt: createdAt},
	}}

	var all, byTrace []map[string]any
	decode(t, serve(t, store, http.MethodGet, prefix, "root", "ADMIN"), &all)
	decode(t, serve(t, store, http.MethodGet, prefix+"?traceId=trace-2", "root", "ADMIN"), &byTrace)
	if len(all) != 2 || len(byTrace) != 1 || byTrace[0]["id"] != "op-2" {
		t.Fatalf("all %v, byTrace %v", all, byTrace)
	}

	if code := serve(t, store, http.MethodGet, prefix, "bob", "USER").Code; code != http.StatusForbidden {
		t.Fatalf("a user listing operations: %d, want 403", code)
	}
	if code := serve(t, store, http.MethodGet, prefix+"/op-1", "bob", "USER").Code; code != http.StatusNotFound {
		t.Fatalf("a user reading someone else's operation: %d, want 404", code)
	}
	if code := serve(t, store, http.MethodGet, prefix+"/op-1", "", "").Code; code != http.StatusForbidden {
		t.Fatalf("an anonymous caller: %d, want 403", code)
	}
}
