package presentation

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
)

type recordingBus struct{ published []domain.Event }

func (*recordingBus) Connect() error { return nil }
func (b *recordingBus) Publish(event domain.Event, context *application.ExecutionContext) *application.Operation {
	b.published = append(b.published, event)
	return application.NewOperation(event, context)
}
func (*recordingBus) Dispatch(*application.Operation)          {}
func (*recordingBus) Subscribe(string, application.Subscriber) {}

type pingCommandEvent struct{ domain.CommandEvent }

func TestAcceptAnswers202WithTheOperationIDAndPublishesTheCommand(t *testing.T) {
	bus := &recordingBus{}
	ctx := application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus})
	recorder := httptest.NewRecorder()

	Accept(recorder, ctx, pingCommandEvent{})

	if recorder.Code != http.StatusAccepted {
		t.Errorf("status: got %d, want 202", recorder.Code)
	}
	if body := recorder.Body.String(); !strings.HasPrefix(body, "{\"operationId\":\"") {
		t.Errorf("body: got %q", body)
	}
	if len(bus.published) != 1 || bus.published[0] != (pingCommandEvent{}) {
		t.Errorf("published: got %v", bus.published)
	}
}

func TestTheStatusOfARefusalFollowsItsKind(t *testing.T) {
	cases := map[int]error{
		http.StatusForbidden:  domain.NotAllowed("Test", "no", nil),
		http.StatusNotFound:   domain.NotFound("Test", "nope", nil),
		http.StatusBadRequest: domain.ConcurrencyConflict("Test", "stale", nil),
	}
	for want, err := range cases {
		if got := StatusOf(err); got != want {
			t.Errorf("StatusOf(%v): got %d, want %d", err, got, want)
		}
	}
	if got := StatusOf(errors.New("plain")); got != http.StatusBadRequest {
		t.Errorf("a plain error: got %d, want 400", got)
	}
}

func TestRefuseAnswersTheMessageWithTheStatusGivenOrTheOneTheRefusalDeserves(t *testing.T) {
	recorder := httptest.NewRecorder()
	Refuse(recorder, domain.NotFound("Test", "Note not found", nil), 0)
	if recorder.Code != http.StatusNotFound || recorder.Body.String() != "{\"message\":\"Note not found\"}\n" {
		t.Errorf("default status: got %d %q", recorder.Code, recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	Refuse(recorder, domain.NotFound("Test", "Note not found", nil), http.StatusConflict)
	if recorder.Code != http.StatusConflict {
		t.Errorf("given status: got %d, want 409", recorder.Code)
	}
}

func TestDecodeBodyReadsTheRoutesStructOrAnswers400(t *testing.T) {
	var body struct {
		Title string `json:"title"`
	}
	request := httptest.NewRequest(http.MethodPost, "/notes", strings.NewReader(`{"title":"Groceries"}`))
	if !DecodeBody(httptest.NewRecorder(), request, &body) || body.Title != "Groceries" {
		t.Errorf("a well-formed body should decode, got %+v", body)
	}

	recorder := httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/notes", strings.NewReader(`{"title":`))
	if DecodeBody(recorder, request, &body) {
		t.Error("a malformed body should be refused")
	}
	if recorder.Code != http.StatusBadRequest || recorder.Body.String() != "{\"message\":\"malformed request body\"}\n" {
		t.Errorf("malformed: got %d %q", recorder.Code, recorder.Body.String())
	}
}

func TestTheExecutionContextTravelsOnTheRequest(t *testing.T) {
	ctx := application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: &recordingBus{}})
	request := WithContext(httptest.NewRequest(http.MethodGet, "/", nil), ctx)
	if ContextOf(request) != ctx {
		t.Error("ContextOf should give back the context attached")
	}

	defer func() {
		if recovered := recover(); recovered == nil {
			t.Error("a request without a context is a wiring error")
		}
	}()
	ContextOf(httptest.NewRequest(http.MethodGet, "/", nil))
}
