package presentation_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	archpres "clean-ddd/architecture/presentation"
	"clean-ddd/contexts/notifications/application/queries"
	"clean-ddd/contexts/notifications/domain/notification"
	"clean-ddd/contexts/notifications/presentation"
)

// The routes against a fake inbox: what a client sees, keys and statuses.

type fakeQueries struct{ items []notification.ListItem }

func (q fakeQueries) FindByRecipient(string, notification.InboxFilters) ([]notification.ListItem, error) {
	return q.items, nil
}

func (q fakeQueries) CountByRecipient(string, bool) (int, error) { return len(q.items), nil }

func serve(items ...notification.ListItem) http.Handler {
	module := &application.Module{Name: "Notifications", Queries: []any{queries.NewGetNotificationsHandler(fakeQueries{items})}}
	mux := http.NewServeMux()
	presentation.Routes(mux, "/v1/notifications", module)
	bus := stubBus{}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := application.NewExecutionContext(application.Options{
			TraceID:  "trace",
			EventBus: bus,
			Auth:     application.Auth{SubjectID: r.Header.Get("subject"), Role: r.Header.Get("role")},
		})
		mux.ServeHTTP(w, archpres.WithContext(r, ctx))
	})
}

func call(handler http.Handler, method, path, subject, role, body string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, path, strings.NewReader(body))
	request.Header.Set("subject", subject)
	request.Header.Set("role", role)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	return recorder
}

func TestAnInboxIsTheRecipientsOrAnAdministratorsAndOmitsWhatDidNotHappen(t *testing.T) {
	sent := time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)
	handler := serve(
		notification.ListItem{ID: "n1", RecipientID: "carol", Title: "Hi", Content: "there", Status: notification.StatusSent,
			Channels: []notification.Channel{notification.ChannelEmail}, CreatedAt: sent, DeliveredVia: notification.ChannelEmail, SentAt: &sent,
			Metadata: map[string]any{"source": "Security.AccountCreated"}},
		notification.ListItem{ID: "n2", RecipientID: "carol", Title: "Hey", Content: "you", Status: notification.StatusFailed,
			Channels: []notification.Channel{notification.ChannelWebSocket}, CreatedAt: sent},
	)

	response := call(handler, http.MethodGet, "/v1/notifications/account/carol?limit=5&onlyUnread=true", "carol", "USER", "")
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", response.Code, response.Body)
	}
	var inbox struct {
		Total, Unread int
		Notifications []map[string]any
	}
	if err := json.Unmarshal(response.Body.Bytes(), &inbox); err != nil {
		t.Fatalf("not JSON: %v", err)
	}
	if inbox.Total != 2 || inbox.Unread != 2 || len(inbox.Notifications) != 2 {
		t.Fatalf("inbox = %+v", inbox)
	}
	first, second := inbox.Notifications[0], inbox.Notifications[1]
	if first["deliveredVia"] != "EMAIL" || first["sentAt"] != "2026-01-01T10:00:00Z" || first["createdAt"] != "2026-01-01T10:00:00Z" {
		t.Fatalf("first = %v", first)
	}
	for _, key := range []string{"readAt", "attempts"} {
		if _, present := first[key]; present {
			t.Fatalf("%s must be omitted: %v", key, first)
		}
	}
	for _, key := range []string{"deliveredVia", "sentAt", "readAt"} {
		if _, present := second[key]; present {
			t.Fatalf("%s must be omitted: %v", key, second)
		}
	}
	if metadata, ok := second["metadata"].(map[string]any); !ok || len(metadata) != 0 {
		t.Fatalf("metadata is always present: %v", second)
	}

	if code := call(handler, http.MethodGet, "/v1/notifications/account/carol", "admin", "ADMIN", "").Code; code != http.StatusOK {
		t.Fatalf("an administrator may read any inbox, got %d", code)
	}
	if code := call(handler, http.MethodGet, "/v1/notifications/account/carol", "dave", "USER", "").Code; code != http.StatusForbidden {
		t.Fatalf("another user may not, got %d", code)
	}
	if code := call(handler, http.MethodGet, "/v1/notifications/account/carol", "", "", "").Code; code != http.StatusForbidden {
		t.Fatalf("an anonymous caller may not, got %d", code)
	}
	if code := call(handler, http.MethodGet, "/v1/notifications/account/carol?limit=x", "carol", "USER", "").Code; code != http.StatusBadRequest {
		t.Fatalf("a malformed page is a 400, got %d", code)
	}
}

func TestCommandsAreAcceptedAndAnUnknownChannelIsRefusedByTheRoute(t *testing.T) {
	handler := serve()

	accepted := call(handler, http.MethodPatch, "/v1/notifications/n1/read", "carol", "USER", "")
	if accepted.Code != http.StatusAccepted || !strings.Contains(accepted.Body.String(), "operationId") {
		t.Fatalf("mark as read: %d %s", accepted.Code, accepted.Body)
	}

	sent := call(handler, http.MethodPost, "/v1/notifications", "admin", "ADMIN",
		`{"recipientId":"carol","title":"Hi","content":"there","channels":["EMAIL"],"metadata":{"email":"carol@notes.fr"}}`)
	if sent.Code != http.StatusAccepted {
		t.Fatalf("send: %d %s", sent.Code, sent.Body)
	}

	unknown := call(handler, http.MethodPost, "/v1/notifications", "admin", "ADMIN",
		`{"recipientId":"carol","title":"Hi","content":"there","channels":["PIGEON"]}`)
	if unknown.Code != http.StatusBadRequest || !strings.Contains(unknown.Body.String(), `"message"`) {
		t.Fatalf("unknown channel: %d %s", unknown.Code, unknown.Body)
	}
}

// stubBus is the bus a route test needs: an operation for an accepted command, nothing dispatched.
type stubBus struct{}

func (stubBus) Connect() error { return nil }
func (stubBus) Publish(event domain.Event, ctx *application.ExecutionContext) *application.Operation {
	return application.NewOperation(event, ctx)
}
func (stubBus) Dispatch(*application.Operation)          {}
func (stubBus) Subscribe(string, application.Subscriber) {}
