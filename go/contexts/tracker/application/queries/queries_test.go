package queries_test

import (
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	trackerapp "clean-ddd/contexts/tracker/application"
	"clean-ddd/contexts/tracker/application/queries"
)

// records is the port over a slice: enough to test who may read what.
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

func contextFor(subjectID, role string) *application.ExecutionContext {
	return application.NewExecutionContext(application.Options{TraceID: "trace", Auth: application.Auth{SubjectID: subjectID, Role: role}})
}

func someRecords() *records {
	return &records{items: []trackerapp.Record{
		{ID: "op-1", Name: "CreateNote", Status: application.StatusSuccess, TraceID: "trace-1", SubjectID: "alice"},
		{ID: "op-2", Name: "ShareNote", Status: application.StatusError, TraceID: "trace-2", SubjectID: "bob"},
	}}
}

// anonymous is a caller nobody signed in: a guest.
var anonymous = contextFor("", "GUEST")

// visibility holds an operation nobody started (a sign-up) and one an account started.
func visibility() *records {
	return &records{items: []trackerapp.Record{
		{ID: "nobody", Name: "SignUp", Status: application.StatusSuccess, TraceID: "trace", SubjectID: ""},
		{ID: "alice", Name: "CreateNote", Status: application.StatusSuccess, TraceID: "trace", SubjectID: "alice"},
	}}
}

func TestAnOperationNobodyStartedIsShownToWhoeverHoldsItsIDSignedInOrNot(t *testing.T) {
	handler := queries.NewGetOperationHandler(visibility())

	for _, ctx := range []*application.ExecutionContext{anonymous, contextFor("bob", "USER")} {
		record, err := application.Query(handler, "nobody", ctx)
		if err != nil || record.ID != "nobody" {
			t.Fatalf("as %+v: got %+v, %v", ctx.Auth(), record, err)
		}
	}
}

func TestAnOperationAnAccountStartedIsShownToThatAccountAndToAnAdministrator(t *testing.T) {
	handler := queries.NewGetOperationHandler(visibility())

	for _, ctx := range []*application.ExecutionContext{contextFor("alice", "USER"), contextFor("root", "ADMIN")} {
		record, err := application.Query(handler, "alice", ctx)
		if err != nil || record.ID != "alice" {
			t.Fatalf("as %+v: got %+v, %v", ctx.Auth(), record, err)
		}
	}
}

func TestAnAnonymousCallerIsAskedToSignInForAnythingElseKnownOrNot(t *testing.T) {
	handler := queries.NewGetOperationHandler(visibility())

	for _, id := range []string{"alice", "unknown"} {
		_, err := application.Query(handler, id, anonymous)
		if !domain.IsNotAllowed(err) {
			t.Fatalf("%s: want a NotAllowed refusal, got %v", id, err)
		}
	}
}

func TestAnotherAccountIsToldAnOperationItDidNotStartDoesNotExist(t *testing.T) {
	handler := queries.NewGetOperationHandler(visibility())

	for _, id := range []string{"alice", "unknown"} {
		_, err := application.Query(handler, id, contextFor("bob", "USER"))
		if !domain.IsNotFound(err) {
			t.Fatalf("%s: want a NotFound refusal, got %v", id, err)
		}
	}
}

func TestOnlyAnAdministratorListsOperations(t *testing.T) {
	handler := queries.NewGetOperationsHandler(someRecords())

	_, err := application.Query(handler, queries.GetOperationsParams{}, contextFor("alice", "USER"))
	if !domain.IsNotAllowed(err) {
		t.Fatalf("want a NotAllowed refusal for a user, got %v", err)
	}
	_, err = application.Query(handler, queries.GetOperationsParams{}, contextFor("", ""))
	if !domain.IsNotAllowed(err) {
		t.Fatalf("want a NotAllowed refusal for an anonymous caller, got %v", err)
	}

	all, err := application.Query(handler, queries.GetOperationsParams{}, contextFor("root", "ADMIN"))
	if err != nil || len(all) != 2 {
		t.Fatalf("got %d records, %v", len(all), err)
	}
	byTrace, err := application.Query(handler, queries.GetOperationsParams{TraceID: "trace-2"}, contextFor("root", "ADMIN"))
	if err != nil || len(byTrace) != 1 || byTrace[0].ID != "op-2" {
		t.Fatalf("got %+v, %v", byTrace, err)
	}
}
