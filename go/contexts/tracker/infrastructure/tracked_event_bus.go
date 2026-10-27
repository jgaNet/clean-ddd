package infrastructure

import (
	"sync"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	trackerapp "clean-ddd/contexts/tracker/application"
	"clean-ddd/sharedkernel/application/integrationevents"
)

// TrackedEventBus decorates any EventBus so that every operation it carries is projected into
// the Tracker records: when dispatched (PENDING) and again once handled (SUCCESS / ERROR /
// SENT). When a command sent by an authenticated caller reaches its outcome, it also publishes
// OperationCompleteIntegrationEvent, which the Notifications context turns into a live
// notification: one notice per command, once there is something to say.
//
// Tracking is a cross-cutting concern: the inner bus does not know it is being watched, and
// the handlers do not know they are being recorded. The inner bus runs the handlers in the
// goroutine that calls Dispatch, so the outcome is known when Dispatch returns; the events a
// handler publishes meanwhile go through the context's bus, which is this one, and are
// recorded on their own. Publish is this bus's, not the inner one's: it is what starts the
// dispatch in the background, so that the record is written before the handling and the
// operation is answered at once.
type TrackedEventBus struct {
	bus     application.EventBus
	records trackerapp.Records
	pending sync.WaitGroup
}

// settler is what the inner bus exposes when it can wait for its own dispatches.
type settler interface {
	Settle()
}

var completionNotice = domain.NameOfType[integrationevents.OperationCompleteIntegrationEvent]()

func NewTrackedEventBus(bus application.EventBus, records trackerapp.Records) *TrackedEventBus {
	return &TrackedEventBus{bus: bus, records: records}
}

func (b *TrackedEventBus) Connect() error { return b.bus.Connect() }

func (b *TrackedEventBus) Publish(event domain.Event, context *application.ExecutionContext) *application.Operation {
	operation := application.NewOperation(event, context)
	b.pending.Add(1)
	go func() {
		defer b.pending.Done()
		b.Dispatch(operation)
	}()
	return operation
}

func (b *TrackedEventBus) Dispatch(operation *application.Operation) {
	// The completion notice is about an operation; it is not one worth tracking itself.
	if domain.NameOf(operation.Event) == completionNotice {
		b.bus.Dispatch(operation)
		return
	}

	b.record(operation)
	b.bus.Dispatch(operation)
	b.record(operation)

	// Only a command is something a client asked for and waits on, and only its outcome is
	// worth a notice (the client already holds the 202). Domain and integration events are
	// recorded for the trace but never announced: announcing them would notify about the
	// notification, which is itself an event, and so on without end.
	isCommand := operation.Event.Kind() == domain.KindCommand
	isOutcome := operation.Status == application.StatusSuccess || operation.Status == application.StatusError
	userID := operation.Context.Auth().SubjectID
	if isCommand && isOutcome && userID != "" {
		b.notifyCompletion(operation, userID)
	}
}

func (b *TrackedEventBus) Subscribe(channel string, handler application.Subscriber) {
	b.bus.Subscribe(channel, handler)
}

// Settle waits for every dispatch in flight, this bus's and the inner one's.
func (b *TrackedEventBus) Settle() {
	b.pending.Wait()
	if inner, ok := b.bus.(settler); ok {
		inner.Settle()
	}
}

// record projects the operation as it is now. A store that cannot be written is logged, not
// raised: the tracking must never fail the operation it tracks.
func (b *TrackedEventBus) record(operation *application.Operation) {
	if err := b.records.Save(trackerapp.ToRecord(operation)); err != nil {
		operation.Context.Log().Error("The operation could not be recorded", err,
			application.Meta{"traceId": operation.Context.TraceID(), "operationId": operation.ID})
	}
}

func (b *TrackedEventBus) notifyCompletion(operation *application.Operation, userID string) {
	notice := integrationevents.OperationCompleteIntegrationEvent{
		OperationID: operation.ID,
		UserID:      userID,
		Status:      string(operation.Status),
		Type:        domain.PublicNameOf(operation.Event),
		Result:      operation.Result,
	}
	if operation.Error != nil {
		notice.Error = operation.Error.Message
	}
	b.Publish(notice, operation.Context)
}
