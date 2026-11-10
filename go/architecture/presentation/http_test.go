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

func (b *recordingBus) PublishWithID(event domain.Event, context *application.ExecutionContext, _ string) *application.Operation {
	return b.Publish(event, context)
}
func (*recordingBus) Dispatch(*application.Operation)          {}
func (*recordingBus) Subscribe(string, application.Subscriber) {}

type pingCommandEvent struct{ domain.CommandEvent }

type pingHandler struct{}

func (pingHandler) Execute(pingCommandEvent, *application.ExecutionContext) (application.Nothing, error) {
	return application.Nothing{}, nil
}

// knockCommandEvent may be asked for by anyone with a key: the key is its proof.
type knockCommandEvent struct {
	domain.CommandEvent
	WithKey bool
}

type knockHandler struct{}

func (knockHandler) Execute(knockCommandEvent, *application.ExecutionContext) (application.Nothing, error) {
	return application.Nothing{}, nil
}

func (knockHandler) AnyoneMayAsk(command knockCommandEvent) bool { return command.WithKey }

type strayCommandEvent struct{ domain.CommandEvent }

var probeModule = &application.Module{
	Name: "Probe",
	Commands: []application.Subscription{
		application.Command[pingCommandEvent, application.Nothing](pingHandler{}),
		application.Command[knockCommandEvent, application.Nothing](knockHandler{}),
	},
}

func contextOf(bus application.EventBus, subjectID string) *application.ExecutionContext {
	auth := application.Auth{Role: "GUEST"}
	if subjectID != "" {
		auth = application.Auth{SubjectID: subjectID, Role: "USER"}
	}
	return application.NewExecutionContext(application.Options{TraceID: "trace", EventBus: bus, Auth: auth})
}

// accept runs Accept on a request carrying the context of subjectID ("" for nobody signed in).
func accept(bus *recordingBus, subjectID string, command domain.Event) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	request := WithContext(httptest.NewRequest(http.MethodPost, "/", nil), contextOf(bus, subjectID))
	Accept(recorder, request, probeModule, command)
	return recorder
}

func TestAcceptPublishesTheCommandOfASignedInCallerAndAnswers202WithTheOperation(t *testing.T) {
	bus := &recordingBus{}

	recorder := accept(bus, "alice", pingCommandEvent{})

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

func TestAcceptRefusesACallerWhoIsNotSignedInWith401AndPublishesNothing(t *testing.T) {
	bus := &recordingBus{}

	recorder := accept(bus, "", pingCommandEvent{})

	if recorder.Code != http.StatusUnauthorized {
		t.Errorf("status: got %d, want 401 (API-CALLER-AT-TRANSPORT)", recorder.Code)
	}
	if body := recorder.Body.String(); body != "{\"message\":\""+AuthenticationRequired+"\"}\n" {
		t.Errorf("body: got %q", body)
	}
	if len(bus.published) != 0 {
		t.Errorf("nothing may be published, got %v", bus.published)
	}
}

func TestAcceptLetsAnyoneAskForACommandWhoseHandlerSaysSoAndOnlyForWhatItSays(t *testing.T) {
	bus := &recordingBus{}

	if recorder := accept(bus, "", knockCommandEvent{WithKey: true}); recorder.Code != http.StatusAccepted {
		t.Errorf("with the key: got %d, want 202", recorder.Code)
	}
	if recorder := accept(bus, "", knockCommandEvent{WithKey: false}); recorder.Code != http.StatusUnauthorized {
		t.Errorf("without it: got %d, want 401", recorder.Code)
	}
	if len(bus.published) != 1 {
		t.Errorf("published: got %v, want the one with the key", bus.published)
	}
}

func TestAcceptTreatsACommandNoHandlerOfTheModuleAnswersAsAWiringError(t *testing.T) {
	bus := &recordingBus{}
	defer func() {
		if recovered := recover(); recovered == nil || !strings.Contains(recovered.(string), "no handler for strayCommandEvent in module Probe") {
			t.Errorf("expected a wiring error, got %v", recovered)
		}
		if len(bus.published) != 0 {
			t.Errorf("nothing may be published, got %v", bus.published)
		}
	}()
	accept(bus, "", strayCommandEvent{})
}

func TestTheStatusOfARefusalFollowsItsKindAndTheCaller(t *testing.T) {
	signedIn, anonymous := contextOf(&recordingBus{}, "alice"), contextOf(&recordingBus{}, "")
	cases := map[int]error{
		http.StatusForbidden:  domain.NotAllowed("Test", "no", nil),
		http.StatusNotFound:   domain.NotFound("Test", "nope", nil),
		http.StatusBadRequest: domain.ConcurrencyConflict("Test", "stale", nil),
	}
	for want, err := range cases {
		if got := StatusOf(signedIn, err); got != want {
			t.Errorf("StatusOf(%v): got %d, want %d", err, got, want)
		}
	}
	if got := StatusOf(signedIn, errors.New("plain")); got != http.StatusBadRequest {
		t.Errorf("a plain error: got %d, want 400", got)
	}
	// One refusal, one status: a caller who is not signed in is told to sign in (API-CALLER-AT-TRANSPORT).
	if got := StatusOf(anonymous, domain.NotAllowed("Test", "no", nil)); got != http.StatusUnauthorized {
		t.Errorf("not allowed, nobody signed in: got %d, want 401", got)
	}
	if NotAllowedStatus(anonymous) != http.StatusUnauthorized || NotAllowedStatus(signedIn) != http.StatusForbidden {
		t.Error("NotAllowedStatus is 401 for nobody signed in, 403 for a signed-in caller")
	}
}

func TestRefuseAnswersTheMessageWithTheStatusGivenOrTheOneTheRefusalDeserves(t *testing.T) {
	ctx := contextOf(&recordingBus{}, "alice")
	recorder := httptest.NewRecorder()
	Refuse(recorder, ctx, domain.NotFound("Test", "Note not found", nil), 0)
	if recorder.Code != http.StatusNotFound || recorder.Body.String() != "{\"message\":\"Note not found\"}\n" {
		t.Errorf("default status: got %d %q", recorder.Code, recorder.Body.String())
	}

	recorder = httptest.NewRecorder()
	Refuse(recorder, ctx, domain.NotFound("Test", "Note not found", nil), http.StatusConflict)
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
