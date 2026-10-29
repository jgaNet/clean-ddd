package bootstrap

import (
	"net/http"
	"testing"
)

// Tracker: following an operation. Sharing a note that does not exist is refused by the
// domain: a command that leaves no trace in Notes, but a full one in Tracker.

func TestTrackerRecordsACommandUpToItsOutcomeInClientWords(t *testing.T) {
	app := StartTestApplication(t)
	admin := app.Admin()

	accepted := admin.Post("/notes/00000000-0000-4000-8000-000000000000/share", map[string]string{"recipientId": "bob"})
	if accepted.Status != http.StatusAccepted || accepted.Header.Get("x-trace-id") == "" {
		t.Fatalf("accepted: %d", accepted.Status)
	}
	operation := app.Operation(admin, accepted.Object()["operationId"].(string))
	if operation["name"] != "ShareNote" || operation["status"] != "ERROR" || operation["traceId"] != accepted.Header.Get("x-trace-id") {
		t.Fatalf("operation: %v", operation)
	}
	if operation["error"].(map[string]any)["type"] != "NoteNotFound" || operation["error"].(map[string]any)["message"] != "Note not found" {
		t.Fatalf("error: %v", operation["error"])
	}
	for _, key := range []string{"id", "subjectId", "createdAt", "finishedAt"} {
		if _, ok := operation[key].(string); !ok {
			t.Fatalf("%s: %v", key, operation)
		}
	}
	for _, absent := range []string{"context", "payload", "result"} {
		if _, has := operation[absent]; has {
			t.Fatalf("%s should not be on the record: %v", absent, operation)
		}
	}
}

func TestTrackerListsOperationsForAnAdministratorByTraceWhenAsked(t *testing.T) {
	app := StartTestApplication(t)
	admin := app.Admin()

	accepted := admin.Post("/notes/00000000-0000-4000-8000-000000000000/share", map[string]string{"recipientId": "bob"})
	app.Operation(admin, accepted.Object()["operationId"].(string))
	trace := accepted.Header.Get("x-trace-id")

	// The trace holds the command and everything it set off: here the notification telling the
	// caller how it went, whose own domain event is recorded too (never announced).
	var records []map[string]any
	for i := 0; i < 200 && len(records) < 2; i++ {
		records = admin.Get("/tracker/operations?traceId=" + trace).Array()
	}
	names := map[string]bool{}
	for _, record := range records {
		names[record["name"].(string)+"/"+record["status"].(string)] = true
		if record["traceId"] != trace {
			t.Fatalf("one trace: %v", record)
		}
	}
	if !names["ShareNote/ERROR"] {
		t.Fatalf("the refused command: %v", names)
	}
	found := false
	for _, record := range records {
		if record["name"] == "NotificationFailed" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the undelivered notice: %v", records)
	}

	// A user may not list operations
	bobID := app.SignUpValidated("bob@tracker.fr", "bob")
	bob := app.AgentAs("bob@tracker.fr", "bob")
	if bob.Get("/tracker/operations").Status != http.StatusForbidden {
		t.Fatal("a user may not list")
	}
	_ = bobID
	if admin.Get("/tracker/operations/00000000-0000-4000-8000-000000000000").Status != http.StatusNotFound {
		t.Fatal("unknown operation")
	}
}

func TestTrackerShowsAnOperationNobodyStartedToWhoeverHoldsItsIDAndOneAnAccountStartedToThatAccountOnly(t *testing.T) {
	app := StartTestApplication(t)
	anonymous := app.Anonymous()

	// A sign-up is anonymous: the only one who knows its id is the caller it was answered to.
	signUp := anonymous.Post("/auth/signup", map[string]string{"identifier": "tracked@x.fr", "password": "secret"})
	operation := app.Accepted(anonymous, signUp)
	if operation["name"] != "SignUp" || operation["status"] != "SUCCESS" {
		t.Fatalf("operation: %v", operation)
	}
	if _, ok := operation["result"].(string); !ok {
		t.Fatalf("result: %v", operation)
	}

	admin := app.Admin()
	signed := admin.Post("/notes/00000000-0000-4000-8000-000000000000/share", map[string]string{"recipientId": "bob"})
	if status := anonymous.Get("/tracker/operations/" + signed.Object()["operationId"].(string)).Status; status != http.StatusForbidden {
		t.Fatalf("anonymous, for an operation an account started: %d", status)
	}
}
