package application

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
)

type DoSomethingCommandEvent struct {
	domain.CommandEvent
	What string
}

func anOperation(subjectID string) *application.Operation {
	ctx := application.NewExecutionContext(application.Options{TraceID: "trace-1", Auth: application.Auth{SubjectID: subjectID, Role: "USER"}})
	return application.NewOperation(DoSomethingCommandEvent{What: "this"}, ctx)
}

func TestKeepsWhatAClientNeedsAndDropsTheExecutionContext(t *testing.T) {
	operation := anOperation("alice")
	record := ToRecord(operation)

	if record.ID != operation.ID || record.Name != "DoSomething" || record.Status != application.StatusPending {
		t.Fatalf("unexpected identity: %+v", record)
	}
	if record.TraceID != "trace-1" || record.SubjectID != "alice" {
		t.Fatalf("unexpected caller: %+v", record)
	}
	if record.Result != nil || record.Error != nil || record.FinishedAt != nil {
		t.Fatalf("a pending operation has no outcome: %+v", record)
	}
	if !record.CreatedAt.Equal(operation.CreatedAt) {
		t.Fatalf("createdAt %v, want %v", record.CreatedAt, operation.CreatedAt)
	}
	if _, has := reflect.TypeOf(record).FieldByName("Context"); has {
		t.Fatal("the record must not carry the execution context")
	}
}

func TestFlattensASuccessIntoResult(t *testing.T) {
	record := ToRecord(anOperation("alice").Succeeded("note-42"))
	if record.Status != application.StatusSuccess || record.Result != "note-42" || record.Error != nil {
		t.Fatalf("unexpected outcome: %+v", record)
	}
	if record.FinishedAt == nil {
		t.Fatal("a finished operation has a finishedAt")
	}
}

func TestFlattensAFailureIntoErrorInWordsAClientCanShow(t *testing.T) {
	record := ToRecord(anOperation("alice").Failed(domain.NotFound("Notes", "Note not found", nil)))
	if record.Status != application.StatusError || record.Result != nil {
		t.Fatalf("unexpected outcome: %+v", record)
	}
	if want := (OperationError{Type: "NotFound", Message: "Note not found"}); record.Error == nil || *record.Error != want {
		t.Fatalf("error %+v, want %+v", record.Error, want)
	}
}

func TestLeavesSubjectIDOutForAnAnonymousCaller(t *testing.T) {
	if record := ToRecord(anOperation("")); record.SubjectID != "" {
		t.Fatalf("subjectId %q, want empty", record.SubjectID)
	}
}
