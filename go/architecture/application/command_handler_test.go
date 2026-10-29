package application

import (
	"reflect"
	"testing"

	"clean-ddd/architecture/domain"
)

// The shape of every concrete handler, and what the template does around it: a guard for who
// may call, an Execute for the use case, a transaction around it, the events after the commit,
// a fresh read when the use case lost a race.

type GreetCommandEvent struct {
	domain.CommandEvent
	Name string
	Then string
	// Conflicts is how many runs of Execute answer with a concurrency conflict before one succeeds.
	Conflicts int
}

type GreetedEvent struct {
	domain.DomainEvent
	Name string
}

type greeter struct{ domain.AggregateRoot }

func (g *greeter) greet(name string) { g.Record(GreetedEvent{Name: name}) }

type greetHandler struct {
	// executions is how many times Execute ran: a conflict re-runs it from a fresh read (ADR 25).
	executions int
}

func (*greetHandler) Guard(context *ExecutionContext) error {
	if context.Auth().Role == "guest" {
		return domain.NotAllowed("Test", "Guests cannot greet", nil)
	}
	return nil
}

func (h *greetHandler) Execute(command GreetCommandEvent, context *ExecutionContext) (string, error) {
	h.executions++
	switch command.Then {
	case "throw":
		panic("boom")
	case "fail":
		return "", domain.NotAllowed("Test", "Refused", nil)
	}
	if h.executions <= command.Conflicts {
		return "", domain.ConcurrencyConflict("Test", "The greeter changed since it was read", nil)
	}
	g := &greeter{AggregateRoot: domain.NewAggregateRoot(domain.NewID("greeter"), 0)}
	g.greet(command.Name)
	PublishDomainEvents(g, context)
	return "Hello " + command.Name, nil
}

// recordingBus remembers what was published, in order, with the message ids the relay gave,
// and dispatches nothing. Given a log it also notes each publication there, next to the unit
// of work's own entries. Told to, it panics once, the way a bus that is down would.
type recordingBus struct {
	log        *[]string
	published  []domain.Event
	messageIDs []string
	panicOnce  bool
}

func (*recordingBus) Connect() error { return nil }

func (b *recordingBus) Publish(event domain.Event, context *ExecutionContext) *Operation {
	return b.PublishWithID(event, context, "")
}

func (b *recordingBus) PublishWithID(event domain.Event, context *ExecutionContext, messageID string) *Operation {
	if b.panicOnce {
		b.panicOnce = false
		panic("the bus is down")
	}
	if b.log != nil {
		*b.log = append(*b.log, "publish")
	}
	b.published = append(b.published, event)
	b.messageIDs = append(b.messageIDs, messageID)
	return NewOperationWithID(messageID, event, context)
}

func (*recordingBus) Dispatch(*Operation)          {}
func (*recordingBus) Subscribe(string, Subscriber) {}

func operationFor(command GreetCommandEvent, role string) (*Operation, *fakeUnitOfWork, *recordingBus) {
	unitOfWork := newFakeUnitOfWork()
	bus := &recordingBus{log: &unitOfWork.log}
	context := NewExecutionContext(Options{
		TraceID: "trace", EventBus: bus, UnitOfWork: unitOfWork, Auth: Auth{SubjectID: "alice", Role: role},
	})
	return NewOperation(command, context), unitOfWork, bus
}

func handleWith(handler *greetHandler, operation *Operation) *Operation {
	Command[GreetCommandEvent, string](handler).Handlers[0].Handle(operation)
	return operation
}

func handle(operation *Operation) *Operation { return handleWith(&greetHandler{}, operation) }

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
	if len(bus.messageIDs) != 1 || bus.messageIDs[0] == "" {
		t.Errorf("the fact should have been published under its outbox entry's id, got %v", bus.messageIDs)
	}
	if pending := unitOfWork.outbox.Pending(); len(pending) != 0 {
		t.Errorf("the outbox should have been relayed, got %v", pending)
	}
	if done.FinishedAt == nil {
		t.Error("a marked operation knows when it finished")
	}
}

func TestRunsTheUseCaseAgainFromAFreshReadWhenItLostARaceAndAnswersWithTheSecondRun(t *testing.T) {
	operation, unitOfWork, _ := operationFor(GreetCommandEvent{Name: "Alice", Conflicts: 1}, "user")
	handler := &greetHandler{}

	done := handleWith(handler, operation)

	if done.Status != StatusSuccess {
		t.Fatalf("status: got %s, want SUCCESS (%v)", done.Status, done.Error)
	}
	if handler.executions != 2 {
		t.Errorf("executions: got %d, want 2", handler.executions)
	}
	// The first attempt rolled back and published nothing; the second committed and published.
	if want := []string{"begin", "rollback", "begin", "commit", "publish"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
}

func TestRefusesWithTheConflictAfterTheThirdAttemptAndPublishesNothing(t *testing.T) {
	operation, unitOfWork, bus := operationFor(GreetCommandEvent{Name: "Alice", Conflicts: 10}, "user")
	handler := &greetHandler{}

	done := handleWith(handler, operation)

	if done.Status != StatusError {
		t.Fatalf("status: got %s, want ERROR", done.Status)
	}
	if done.Error == nil || done.Error.Type != domain.TypeConcurrencyConflict {
		t.Errorf("error: got %+v, want ConcurrencyConflict", done.Error)
	}
	if handler.executions != ConflictAttempts {
		t.Errorf("executions: got %d, want %d", handler.executions, ConflictAttempts)
	}
	if want := []string{"begin", "rollback", "begin", "rollback", "begin", "rollback"}; !reflect.DeepEqual(unitOfWork.log, want) {
		t.Errorf("log: got %v, want %v", unitOfWork.log, want)
	}
	if len(bus.published) != 0 {
		t.Errorf("published: got %v, want nothing", bus.published)
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

	greeting, err := Run[GreetCommandEvent, string](&greetHandler{}, GreetCommandEvent{Name: "Bob"}, operation.Context)

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
	handler := &greetHandler{}
	subscription := Command[GreetCommandEvent, string](handler)

	if subscription.Channel != "GreetCommandEvent" {
		t.Errorf("channel: got %q", subscription.Channel)
	}
	if wrapped, ok := subscription.Handlers[0].(inner); !ok || wrapped.Inner() != any(handler) {
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
