// Package tracker is the wiring of the Tracker context: the records store, the bus decorator
// the composition root wraps the application's bus with, and the module of its two queries.
// Plain data: construct the handler, pass its port, list it (ARCH-MODULES-DATA).
package tracker

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/infrastructure"
	trackerapp "clean-ddd/contexts/tracker/application"
	"clean-ddd/contexts/tracker/application/queries"
	trackerinfra "clean-ddd/contexts/tracker/infrastructure"
)

// OperationStore is the context's store, which the composition root hands to the unit of work.
type OperationStore = infrastructure.InMemoryDataSource[trackerapp.Record]

func NewOperationStore() *OperationStore {
	return infrastructure.NewInMemoryDataSource[trackerapp.Record]()
}

// NewOperationRecords is the Records port over the store: written by the bus decorator, read by the queries.
func NewOperationRecords(store *OperationStore) *trackerinfra.InMemoryOperationRecords {
	return trackerinfra.NewInMemoryOperationRecords(store)
}

// NewTrackedEventBus is the application's event bus: any bus, decorated so that every operation is recorded.
func NewTrackedEventBus(bus application.EventBus, records trackerapp.Records) *trackerinfra.TrackedEventBus {
	return trackerinfra.NewTrackedEventBus(bus, records)
}

// LocalModule is the Tracker module for the local environment: two queries over the records, no command.
func LocalModule(records trackerapp.Records) *application.Module {
	return &application.Module{
		Name: "Tracker",
		Queries: []any{
			queries.NewGetOperationsHandler(records),
			queries.NewGetOperationHandler(records),
		},
	}
}
