package bootstrap

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/bootstrap/transport"
	"clean-ddd/contexts/notes"
	notesinfra "clean-ddd/contexts/notes/infrastructure"
	notesapi "clean-ddd/contexts/notes/presentation"
	"clean-ddd/contexts/notifications"
	notificationsapi "clean-ddd/contexts/notifications/presentation"
	"clean-ddd/contexts/security"
	securityapi "clean-ddd/contexts/security/presentation"
	"clean-ddd/contexts/tracker"
	trackerapi "clean-ddd/contexts/tracker/presentation"
)

// CreateApplication is the application the entry point serves, from the settings of the
// environment: wired, its modules listening on the bus, seeded; not yet serving.
func CreateApplication(logger application.Logger) (*transport.Server, error) {
	return Compose(SettingsFromEnv(), logger)
}

// Compose builds the whole application from the settings given, on the transport, which knows
// no context. The modules start before the seed so that the seed's events reach their handlers.
func Compose(settings Settings, logger application.Logger) (*transport.Server, error) {
	// The stores, listed once: the unit of work of a request snapshots them all.
	noteStore := notes.NewNoteStore()
	accountStore := security.NewAccountStore()
	operationStore := tracker.NewOperationStore()
	notificationStore := notifications.NewNotificationStore()
	stores := []infrastructure.Snapshotter{noteStore, accountStore, operationStore, notificationStore}

	// The application's bus: the in-memory bus, decorated so that every operation is recorded.
	records := tracker.NewOperationRecords(operationStore)
	eventBus := tracker.NewTrackedEventBus(infrastructure.NewInMemoryEventBus(), records)

	// The modules, from each context's wiring. Notes asks Security's read model through its own
	// port: the adapter is built here, where the two contexts meet.
	securityWiring := security.LocalModule(accountStore, settings.Security)
	trackerModule := tracker.LocalModule(records)
	notesModule := notes.LocalModule(noteStore, notesinfra.NewSecurityAccountDirectory(securityWiring.AccountQueries))
	notificationsWiring := notifications.LocalModule(notificationStore, settings.Notifications, logger)

	app := application.NewApplication(eventBus).
		RegisterModule(trackerModule).
		RegisterModule(notesModule).
		RegisterModule(securityWiring.Module).
		RegisterModule(notificationsWiring.Module)
	if err := app.StartModules(); err != nil {
		return nil, err
	}

	// The transport: Security says who is calling; the routes go under the API prefix, each
	// context's under its own; the websocket beside the API, at the root.
	server := transport.New(eventBus, transport.Options{
		Logger:       logger,
		APIPrefix:    settings.APIPrefix,
		Port:         settings.Port,
		WebOrigins:   settings.WebOrigins,
		Stores:       stores,
		Authenticate: securityWiring.Authentication.Authenticate,
	})
	// What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
	// an in-memory outbox, and the line is where a store's outbox would be relayed. The context is
	// one a request would get, with a unit of work of its own, so that each reaction it delivers
	// runs in a transaction of its own and publishes through the outbox, as after a request.
	application.RelayOutbox(infrastructure.SharedOutbox, eventBus, server.ExecutionContext("startup", transport.Anonymous))

	homeRoutes(server.Mux(), server.Prefix(), HomeViewModel{Name: settings.Name, Version: settings.Version})
	server.
		Routes("/notes", notesapi.Routes, notesModule).
		Routes("/tracker/operations", trackerapi.Routes, trackerModule).
		Routes("/", securityapi.Routes, securityWiring.Module).
		Routes("/notifications", notificationsapi.Routes, notificationsWiring.Module)
	server.Mux().Handle("GET /ws", notificationsWiring.WebSocket.Handler(transport.CallerOf))

	// The administrator account the settings describe, created before the first request.
	if settings.AdminAccount != nil {
		if _, err := securityWiring.RegisterAdmin(settings.AdminAccount.Identifier, settings.AdminAccount.Password, eventBus); err != nil && logger != nil {
			logger.Error("The administrator could not be registered", err, nil)
		}
	}
	return server, nil
}
