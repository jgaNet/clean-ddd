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

func TestAUserFollowsTheirOwnOperation(t *testing.T) {
	handler := queries.NewGetOperationHandler(someRecords())

	record, err := application.Query(handler, "op-1", contextFor("alice", "USER"))
	if err != nil || record.ID != "op-1" {
		t.Fatalf("got %+v, %v", record, err)
	}
}

func TestSomeoneElsesOperationDoesNotExistForAUser(t *testing.T) {
	handler := queries.NewGetOperationHandler(someRecords())

	_, err := application.Query(handler, "op-2", contextFor("alice", "USER"))
	if !domain.IsNotFound(err) {
		t.Fatalf("want a NotFound refusal, got %v", err)
	}
	_, err = application.Query(handler, "op-9", contextFor("alice", "USER"))
	if !domain.IsNotFound(err) {
		t.Fatalf("want a NotFound refusal for an unknown id, got %v", err)
	}
}

func TestAnAdministratorFollowsAnyOperation(t *testing.T) {
	handler := queries.NewGetOperationHandler(someRecords())

	record, err := application.Query(handler, "op-2", contextFor("root", "ADMIN"))
	if err != nil || record.SubjectID != "bob" {
		t.Fatalf("got %+v, %v", record, err)
	}
}

func TestAnAnonymousCallerFollowsNothing(t *testing.T) {
	handler := queries.NewGetOperationHandler(someRecords())

	_, err := application.Query(handler, "op-1", contextFor("", ""))
	if !domain.IsNotAllowed(err) {
		t.Fatalf("want a NotAllowed refusal, got %v", err)
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
