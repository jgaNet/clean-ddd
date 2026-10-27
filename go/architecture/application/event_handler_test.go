package application

import (
	"testing"

	"clean-ddd/architecture/domain"
)

type WavedEvent struct {
	domain.DomainEvent
	Then string
}

type onWaved struct{ reacted bool }

func (h *onWaved) Execute(event WavedEvent, _ *ExecutionContext) error {
	switch event.Then {
	case "throw":
		panic("boom")
	case "fail":
		return domain.NotFound("Test", "Nothing to react to", nil)
	}
	h.reacted = true
	return nil
}

func reactionFor(event WavedEvent, handler *onWaved) *Operation {
	operation := NewOperation(event, NewExecutionContext(Options{TraceID: "trace", EventBus: noBus{}}))
	Reaction[WavedEvent](handler).Handlers[0].Handle(operation)
	return operation
}

func TestMarksTheOperationSentOnceItReacted(t *testing.T) {
	handler := &onWaved{}
	done := reactionFor(WavedEvent{}, handler)
	if !handler.reacted {
		t.Error("the handler should have reacted")
	}
	if done.Status != StatusSent {
		t.Errorf("status: got %s, want SENT", done.Status)
	}
}

func TestRecordsAFailedReactionOnTheOperation(t *testing.T) {
	done := reactionFor(WavedEvent{Then: "fail"}, &onWaved{})
	if done.Status != StatusError {
		t.Fatalf("status: got %s, want ERROR", done.Status)
	}
	if done.Error == nil || done.Error.Type != domain.TypeNotFound {
		t.Errorf("error: got %+v, want NotFound", done.Error)
	}
}

func TestTurnsAPanicIntoAFailedOperationInsteadOfAnUnhandledError(t *testing.T) {
	done := reactionFor(WavedEvent{Then: "throw"}, &onWaved{})
	if done.Status != StatusError {
		t.Fatalf("status: got %s, want ERROR", done.Status)
	}
	if done.Error == nil || done.Error.Message != "boom" || done.Error.Type != domain.TypeUnknown {
		t.Errorf("error: got %+v, want Unknown boom", done.Error)
	}
}

func TestTheReactionIsListedUnderTheEventsNameAndExposesTheHandler(t *testing.T) {
	handler := &onWaved{}
	subscription := Reaction[WavedEvent](handler)
	if subscription.Channel != "WavedEvent" {
		t.Errorf("channel: got %q", subscription.Channel)
	}
	if wrapped, ok := subscription.Handlers[0].(inner); !ok || wrapped.Inner() != handler {
		t.Error("the subscriber should expose the handler it wraps")
	}
}

func TestAnEventOfAnotherTypeOnTheChannelIsAFailedReaction(t *testing.T) {
	operation := NewOperation(GreetedEvent{Name: "wrong"}, NewExecutionContext(Options{TraceID: "trace", EventBus: noBus{}}))
	Reaction[WavedEvent](&onWaved{}).Handlers[0].Handle(operation)
	if operation.Status != StatusError || operation.Error == nil || operation.Error.Type != domain.TypeUnknown {
		t.Errorf("got %s %+v, want an Unknown failure", operation.Status, operation.Error)
	}
}
