package application

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/domain"
)

// The shape of every concrete handler, and what the template does around it: a guard for who
// may call, an Execute for the use case, a transaction around it, the events after the commit.

type GreetCommandEvent struct {
	domain.CommandEvent
	Name string
	Then string
}

type GreetedEvent struct {
	domain.DomainEvent
	Name string
}

type greeter struct{ domain.AggregateRoot }

func (g *greeter) greet(name string) { g.Record(GreetedEvent{Name: name}) }

type greetHandler struct{}

func (greetHandler) Guard(context *ExecutionContext) error {
	if context.Auth().Role == "guest" {
		return domain.NotAllowed("Test", "Guests cannot greet", nil)
	}
	return nil
}

func (greetHandler) Execute(command GreetCommandEvent, context *ExecutionContext) (string, error) {
	switch command.Then {
	case "throw":
		panic("boom")
	case "fail":
		return "", domain.NotAllowed("Test", "Refused", nil)
	}
	g := &greeter{AggregateRoot: domain.NewAggregateRoot(domain.NewID("greeter"), 0)}
	g.greet(command.Name)
	PublishDomainEvents(g, context)
	return "Hello " + command.Name, nil
}

// recordingBus remembers what was published, in order, and dispatches nothing. Given a log it
// also notes each publication there, next to the unit of work's own entries.
type recordingBus struct {
	log       *[]string
	published []domain.Event
}

func (*recordingBus) Connect() error { return nil }

func (b *recordingBus) Publish(event domain.Event, context *ExecutionContext) *Operation {
	if b.log != nil {
		*b.log = append(*b.log, "publish")
	}
	b.published = append(b.published, event)
	return NewOperation(event, context)
}

func (*recordingBus) Dispatch(*Operation)          {}
func (*recordingBus) Subscribe(string, Subscriber) {}

func operationFor(command GreetCommandEvent, role string) (*Operation, *fakeUnitOfWork, *recordingBus) {
	unitOfWork := &fakeUnitOfWork{}
	bus := &recordingBus{log: &unitOfWork.log}
	context := NewExecutionContext(Options{
		TraceID: "trace", EventBus: bus, UnitOfWork: unitOfWork, Auth: Auth{SubjectID: "alice", Role: role},
	})
	return NewOperation(command, context), unitOfWork, bus
}

func handle(operation *Operation) *Operation {
	Command[GreetCommandEvent, string](greetHandler{}).Handlers[0].Handle(operation)
	return operation
}

func TestRunsTheUseCaseInsideATransactionAndPublishesTheDomainEventsAfterTheCommit(t *testing.T) {
	operation, unitOfWork, bus := operationFor(GreetCommandEvent{Name: "Alice"}, "user")

	done := handle(operation)

	if done.Status != StatusSuccess {
		t.Fatalf("status: got %s, want SUCCESS (%v)", done.Status, done.Error)
	}
	if done.Result != "Hello Alice" {
		t.Errorf("result: got %v", done.Result)
	}
	if want := []string{"begin", "commit", "publish"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
	if want := []domain.Event{GreetedEvent{Name: "Alice"}}; !reflect.DeepEqual(bus.published, want) {
		t.Errorf("published: got %v, want %v", bus.published, want)
	}
	if done.FinishedAt == nil {
		t.Error("a marked operation knows when it finished")
	}
}

func TestRefusesAtTheGuardWithoutOpeningATransactionOrRunningTheUseCase(t *testing.T) {
	operation, unitOfWork, bus := operationFor(GreetCommandEvent{Name: "Alice"}, "guest")

	done := handle(operation)

	if done.Status != StatusError {
		t.Fatalf("status: got %s, want ERROR", done.Status)
	}
	if done.Error == nil || done.Error.Type != domain.TypeNotAllowed {
		t.Errorf("error: got %+v, want NotAllowed", done.Error)
	}
	if len(unitOfWork.log) != 0 || len(bus.published) != 0 {
		t.Errorf("nothing should have happened: log %v, published %v", unitOfWork.log, bus.published)
	}
}

func TestRollsBackAFailedResultAndPublishesNothing(t *testing.T) {
	operation, unitOfWork, bus := operationFor(GreetCommandEvent{Name: "Alice", Then: "fail"}, "user")

	done := handle(operation)

	if done.Status != StatusError || done.Error == nil || done.Error.Message != "Refused" {
		t.Fatalf("status: got %s %+v, want ERROR Refused", done.Status, done.Error)
	}
	if want := []string{"begin", "rollback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
	if len(bus.published) != 0 {
		t.Errorf("published: got %v, want nothing", bus.published)
	}
}

func TestTurnsAPanicIntoAFailedOperationInsteadOfCrashingAndRollsBack(t *testing.T) {
	operation, unitOfWork, bus := operationFor(GreetCommandEvent{Name: "Alice", Then: "throw"}, "user")

	done := handle(operation)

	if done.Status != StatusError {
		t.Fatalf("status: got %s, want ERROR", done.Status)
	}
	if done.Error == nil || done.Error.Message != "boom" || done.Error.Type != domain.TypeUnknown {
		t.Errorf("error: got %+v, want Unknown boom", done.Error)
	}
	if want := []string{"begin", "rollback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
	if len(bus.published) != 0 {
		t.Errorf("published: got %v, want nothing", bus.published)
	}
}

func TestRunAnswersTheUseCasesValueToASynchronousCaller(t *testing.T) {
	operation, unitOfWork, _ := operationFor(GreetCommandEvent{Name: "Bob"}, "user")

	greeting, err := Run[GreetCommandEvent, string](greetHandler{}, GreetCommandEvent{Name: "Bob"}, operation.Context)

	if err != nil || greeting != "Hello Bob" {
		t.Errorf("Run: got (%q, %v)", greeting, err)
	}
	if want := []string{"begin", "commit", "publish"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
	if operation.Status != StatusPending {
		t.Error("Run marks no operation")
	}
}

type silentHandler struct{}

func (silentHandler) Execute(GreetCommandEvent, *ExecutionContext) (Nothing, error) {
	return Nothing{}, nil
}

func TestACommandWithNothingToAnswerLeavesTheOperationWithoutAResult(t *testing.T) {
	operation, _, _ := operationFor(GreetCommandEvent{Name: "Alice"}, "user")

	Command[GreetCommandEvent, Nothing](silentHandler{}).Handlers[0].Handle(operation)

	if operation.Status != StatusSuccess || operation.Result != nil {
		t.Errorf("got %s %v, want SUCCESS with no result", operation.Status, operation.Result)
	}
}

func TestTheSubscriptionIsListedUnderTheCommandsNameAndExposesTheHandler(t *testing.T) {
	subscription := Command[GreetCommandEvent, string](greetHandler{})

	if subscription.Channel != "GreetCommandEvent" {
		t.Errorf("channel: got %q", subscription.Channel)
	}
	if wrapped, ok := subscription.Handlers[0].(inner); !ok || wrapped.Inner() != (greetHandler{}) {
		t.Error("the subscriber should expose the handler it wraps")
	}
}

func TestAnEventOfAnotherTypeOnTheChannelIsAFailedOperation(t *testing.T) {
	operation, _, _ := operationFor(GreetCommandEvent{}, "user")
	operation.Event = GreetedEvent{Name: "wrong"}

	handle(operation)

	if operation.Status != StatusError || operation.Error == nil || operation.Error.Type != domain.TypeUnknown {
		t.Errorf("got %s %+v, want an Unknown failure", operation.Status, operation.Error)
	}
}
