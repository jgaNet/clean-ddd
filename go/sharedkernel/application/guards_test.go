package application

import (
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
)

type noBus struct{}

func (noBus) Connect() error { return nil }
func (noBus) Publish(domain.Event, *application.ExecutionContext) *application.Operation {
	panic("not used")
}
func (noBus) PublishWithID(domain.Event, *application.ExecutionContext, string) *application.Operation {
	panic("not used")
}
func (noBus) Dispatch(*application.Operation)          {}
func (noBus) Subscribe(string, application.Subscriber) {}

func contextFor(subjectID, role string) *application.ExecutionContext {
	return application.NewExecutionContext(application.Options{
		TraceID: "trace", EventBus: noBus{}, Auth: application.Auth{SubjectID: subjectID, Role: role},
	})
}

func TestAnswersTheIDOfASignedInUserOrAdministrator(t *testing.T) {
	if id, err := RequireSignedIn(contextFor("alice", "USER"), "Notes"); err != nil || id != domain.NewID("alice") {
		t.Errorf("a user: got (%v, %v)", id, err)
	}
	if id, err := RequireSignedIn(contextFor("root", "ADMIN"), "Notes"); err != nil || id != domain.NewID("root") {
		t.Errorf("an administrator: got (%v, %v)", id, err)
	}
}

func TestRefusesAGuestAnUnknownRoleAndAnAnonymousCallerNamingTheService(t *testing.T) {
	cases := map[string]*application.ExecutionContext{
		"guest":     contextFor("alice", "GUEST"),
		"unknown":   contextFor("alice", "boss"),
		"anonymous": contextFor("", "USER"),
		"nobody":    contextFor("", ""),
	}
	for name, context := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := RequireSignedIn(context, "Notes")
			refused, ok := domain.Refusal(err)
			if !ok {
				t.Fatalf("should be refused, got %v", err)
			}
			if refused.Type != domain.TypeNotAllowed || refused.Service != "Notes" {
				t.Errorf("got %s from %s, want NotAllowed from Notes", refused.Type, refused.Service)
			}
		})
	}
}
