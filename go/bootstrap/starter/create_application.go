// Package bootstrap is the composition root an application starts from (ADR 27). In the
// reference it lives in bootstrap/starter, beside the reference's own, which knows four
// contexts; `clean-ddd create` gives it to a new application as bootstrap/create_application.go,
// in place of the reference's, which is why it is package bootstrap wherever it is. It knows one
// context, the Tracker, because a command is answered `202 { operationId }` and the Tracker is
// what a client follows that operation at, up to its outcome and its result
// (`GET /v1/tracker/operations/{id}`). Nobody signs in here: every caller is anonymous until a
// context that owns accounts gives the transport its Authenticate.
//
// A new context is added here, as the Tracker is: its store in the list, its module after the
// Tracker's, its routes under its own prefix (`server.Routes("/notes", notesapi.Routes, module)`),
// which the transport serves under the API's (`/v1/notes`).
package bootstrap

import (
	"os"
	"strconv"
	"strings"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/bootstrap/transport"
	"clean-ddd/contexts/tracker"
	trackerapi "clean-ddd/contexts/tracker/presentation"
)

// Settings is what the environment decides: the port, the API prefix, the origins a front end
// may call from.
type Settings struct {
	Port       int
	APIPrefix  string
	WebOrigins []string
}

// SettingsFromEnv reads PORT (10000), API_PREFIX (v1) and WEB_ORIGINS (comma-separated, none).
func SettingsFromEnv() Settings {
	port, err := strconv.Atoi(os.Getenv("PORT"))
	if err != nil {
		port = 10000
	}
	prefix := os.Getenv("API_PREFIX")
	if prefix == "" {
		prefix = "v1"
	}
	var origins []string
	for _, origin := range strings.Split(os.Getenv("WEB_ORIGINS"), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			origins = append(origins, origin)
		}
	}
	return Settings{Port: port, APIPrefix: prefix, WebOrigins: origins}
}

// CreateApplication is the application the entry point serves, from the settings of the environment.
func CreateApplication(logger application.Logger) (*transport.Server, error) {
	return Compose(SettingsFromEnv(), logger)
}

// Compose builds the application from the settings given: wired, its modules listening on the
// bus; not yet serving.
func Compose(settings Settings, logger application.Logger) (*transport.Server, error) {
	// The stores, listed once: the unit of work of a request snapshots them all.
	operationStore := tracker.NewOperationStore()
	stores := []infrastructure.Snapshotter{operationStore}

	// The application's bus: the in-memory bus, decorated so that every operation is recorded.
	records := tracker.NewOperationRecords(operationStore)
	eventBus := tracker.NewTrackedEventBus(infrastructure.NewInMemoryEventBus(), records)

	trackerModule := tracker.LocalModule(records)
	app := application.NewApplication(eventBus).
		RegisterModule(trackerModule)
	if err := app.StartModules(); err != nil {
		return nil, err
	}
	// What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
	// an in-memory outbox, and the line is where a store's outbox would be relayed.
	application.RelayOutbox(infrastructure.SharedOutbox, eventBus, application.NewExecutionContext(application.Options{
		TraceID: "startup", EventBus: eventBus, Logger: logger,
	}))

	server := transport.New(eventBus, transport.Options{
		Logger:     logger,
		APIPrefix:  settings.APIPrefix,
		Port:       settings.Port,
		WebOrigins: settings.WebOrigins,
		Stores:     stores,
	})
	server.Routes("/tracker/operations", trackerapi.Routes, trackerModule)
	return server, nil
}
