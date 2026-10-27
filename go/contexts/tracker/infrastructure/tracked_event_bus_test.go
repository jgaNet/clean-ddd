package infrastructure_test

import (
	"fmt"
	"sort"
	"sync"
	"testing"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	trackerapp "clean-ddd/contexts/tracker/application"
	trackerinfra "clean-ddd/contexts/tracker/infrastructure"
	"clean-ddd/sharedkernel/application/integrationevents"
)

type GreetCommandEvent struct {
	domain.CommandEvent
	Who string
}

type GreetedEvent struct {
	domain.DomainEvent
	Who string
}

type greetHandler struct{}

func (greetHandler) Execute(command GreetCommandEvent, ctx *application.ExecutionContext) (string, error) {
	if command.Who == "nobody" {
		return "", domain.NotFound("Test", "Nobody to greet", nil)
	}
	ctx.Publish(GreetedEvent{Who: command.Who})
	return fmt.Sprintf("Hello %s", command.Who), nil
}

type onGreeted struct{}

func (onGreeted) Execute(GreetedEvent, *application.ExecutionContext) error { return nil }

// completionRecorder stands in for the Notifications context: keeps the completion notices it receives.
type completionRecorder struct {
	mu          sync.Mutex
	completions []integrationevents.OperationCompleteIntegrationEvent
}

func (r *completionRecorder) Execute(event integrationevents.OperationCompleteIntegrationEvent, _ *application.ExecutionContext) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.completions = append(r.completions, event)
	return nil
}

func (r *completionRecorder) all() []integrationevents.OperationCompleteIntegrationEvent {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]integrationevents.OperationCompleteIntegrationEvent(nil), r.completions...)
}

type setup struct {
	store       *infrastructure.InMemoryDataSource[trackerapp.Record]
	bus         *trackerinfra.TrackedEventBus
	completions *completionRecorder
}

func subscribed(t *testing.T) *setup {
	t.Helper()
	store := infrastructure.NewInMemoryDataSource[trackerapp.Record]()
	s := &setup{
		store:       store,
		bus:         trackerinfra.NewTrackedEventBus(infrastructure.NewInMemoryEventBus(), trackerinfra.NewInMemoryOperationRecords(store)),
		completions: &completionRecorder{},
	}
	module := &application.Module{
		Name:              "Test",
		Commands:          []application.Subscription{application.Command(greetHandler{})},
		DomainEvents:      []application.Subscription{application.Reaction(onGreeted{})},
		IntegrationEvents: []application.Subscription{application.Reaction(s.completions)},
	}
	if err := module.Start(s.bus); err != nil {
		t.Fatal(err)
	}
	return s
}

func (s *setup) contextFor(subjectID string) *application.ExecutionContext {
	return application.NewExecutionContext(application.Options{TraceID: "trace-1", EventBus: s.bus, Auth: application.Auth{SubjectID: subjectID, Role: "USER"}})
}

// records is every record as (name, status), in the order they were first written.
func (s *setup) records() [][2]string {
	out := [][2]string{}
	for _, record := range s.store.All() {
		out = append(out, [2]string{record.Name, string(record.Status)})
	}
	return out
}

func (s *setup) recordOf(t *testing.T, operation *application.Operation) trackerapp.Record {
	t.Helper()
	record, ok := s.store.Get(operation.ID)
	if !ok {
		t.Fatalf("operation %s was not recorded", operation.ID)
	}
	return record
}

func TestRecordsACommandUpToItsOutcomeAndTheEventsItSetOffUnderTheSameTrace(t *testing.T) {
	s := subscribed(t)

	operation := s.bus.Publish(GreetCommandEvent{Who: "Alice"}, s.contextFor("alice"))
	s.bus.Settle()

	record := s.recordOf(t, operation)
	if record.Name != "Greet" || record.Status != application.StatusSuccess || record.TraceID != "trace-1" || record.SubjectID != "alice" {
		t.Fatalf("unexpected record: %+v", record)
	}
	if record.Result != "Hello Alice" {
		t.Fatalf("result %v, want Hello Alice", record.Result)
	}
	if got, want := s.records(), [][2]string{{"Greet", "SUCCESS"}, {"Greeted", "SENT"}}; fmt.Sprint(got) != fmt.Sprint(want) {
		t.Fatalf("records %v, want %v", got, want)
	}
}

func TestRecordsAFailedOperationWithTheErrorInClientWords(t *testing.T) {
	s := subscribed(t)

	operation := s.bus.Publish(GreetCommandEvent{Who: "nobody"}, s.contextFor("alice"))
	s.bus.Settle()

	record := s.recordOf(t, operation)
	if record.Status != application.StatusError {
		t.Fatalf("status %s, want ERROR", record.Status)
	}
	if want := (trackerapp.OperationError{Type: "NotFound", Message: "Nobody to greet"}); record.Error == nil || *record.Error != want {
		t.Fatalf("error %+v, want %+v", record.Error, want)
	}
}

func TestAnnouncesTheOutcomeOfAnAuthenticatedCallersCommandOnceAndNothingElse(t *testing.T) {
	s := subscribed(t)

	s.bus.Publish(GreetCommandEvent{Who: "Alice"}, s.contextFor("alice"))
	s.bus.Publish(GreetCommandEvent{Who: "nobody"}, s.contextFor("alice"))
	s.bus.Publish(GreetCommandEvent{Who: "Carol"}, s.contextFor(""))
	s.bus.Publish(GreetedEvent{Who: "Dave"}, s.contextFor("alice"))
	s.bus.Settle()

	// The dispatches run in parallel: the notices come in any order, so they are compared sorted.
	announced := []string{}
	for _, notice := range s.completions.all() {
		announced = append(announced, notice.Type+" "+notice.Status)
	}
	sort.Strings(announced)
	if fmt.Sprint(announced) != fmt.Sprint([]string{"Greet ERROR", "Greet SUCCESS"}) {
		t.Fatalf("announced %v, want one SUCCESS and one ERROR for Greet", announced)
	}
	for _, notice := range s.completions.all() {
		switch notice.Status {
		case "SUCCESS":
			if notice.Result != "Hello Alice" || notice.Error != "" {
				t.Fatalf("unexpected success notice: %+v", notice)
			}
		case "ERROR":
			if notice.Error != "Nobody to greet" || notice.Result != nil {
				t.Fatalf("unexpected error notice: %+v", notice)
			}
		}
		if notice.UserID != "alice" || notice.OperationID == "" {
			t.Fatalf("unexpected notice: %+v", notice)
		}
	}

	// The notice itself is never recorded; a domain event is recorded for the trace, never announced.
	greets, greetedSent := 0, 0
	for _, record := range s.records() {
		switch {
		case record[0] == "OperationComplete":
			t.Fatalf("the completion notice must not be recorded: %v", s.records())
		case record[0] == "Greet":
			greets++
		case record[0] == "Greeted" && record[1] == "SENT":
			greetedSent++
		}
	}
	if greets != 3 || greetedSent == 0 {
		t.Fatalf("records %v: want 3 Greet and a Greeted SENT", s.records())
	}
}
