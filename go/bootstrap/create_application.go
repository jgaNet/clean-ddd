package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/architecture/presentation"
	"clean-ddd/contexts/notes"
	notesinfra "clean-ddd/contexts/notes/infrastructure"
	notesapi "clean-ddd/contexts/notes/presentation"
	"clean-ddd/contexts/notifications"
	notificationsapi "clean-ddd/contexts/notifications/presentation"
	"clean-ddd/contexts/security"
	securityapi "clean-ddd/contexts/security/presentation"
	"clean-ddd/contexts/tracker"
	trackerinfra "clean-ddd/contexts/tracker/infrastructure"
	trackerapi "clean-ddd/contexts/tracker/presentation"
)

const TraceHeader = "x-trace-id"

// App is the application: wired, its modules listening on the bus, seeded; not yet serving.
type App struct {
	Handler  http.Handler
	eventBus *trackerinfra.TrackedEventBus
	logger   application.Logger
	port     int
}

// CreateApplication builds the whole application. The modules start before the seed so that
// the seed's events reach their handlers.
func CreateApplication(settings Settings, logger application.Logger) (*App, error) {
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
	// What a previous run made durable and did not publish goes out now (ADR 24): nothing, with
	// an in-memory outbox, and the line is where a store's outbox would be relayed. Every
	// request's unit of work guards that same outbox, one per process.
	application.RelayOutbox(infrastructure.SharedOutbox, eventBus, application.NewExecutionContext(application.Options{
		TraceID: "startup", EventBus: eventBus, Logger: logger,
	}))

	// The routes, under the API prefix, each context's under its own; the websocket at the root.
	mux := http.NewServeMux()
	prefix := "/" + settings.APIPrefix
	homeRoutes(mux, prefix, HomeViewModel{Name: settings.Name, Version: settings.Version})
	notesapi.Routes(mux, prefix+"/notes", notesModule)
	trackerapi.Routes(mux, prefix+"/tracker/operations", trackerModule)
	securityapi.Routes(mux, prefix, securityWiring.Module)
	notificationsapi.Routes(mux, prefix+"/notifications", notificationsWiring.Module)
	mux.Handle("GET /ws", notificationsWiring.WebSocket.Handler(securityapi.AuthOf))

	// One execution context per request: its trace, its caller, and its own unit of work. A unit
	// of work is a request-scoped thing; sharing one instance across requests would make
	// concurrent commands join each other's transaction. The middlewares run from the outermost
	// in: CORS, then the caller is identified, then the context is built.
	withContext := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			traceID := r.Header.Get(TraceHeader)
			if traceID == "" {
				traceID = domain.GenerateID().Value()
			}
			ctx := application.NewExecutionContext(application.Options{
				TraceID:    traceID,
				Auth:       securityapi.AuthOf(r),
				EventBus:   eventBus,
				UnitOfWork: infrastructure.NewInMemoryUnitOfWork(stores...),
				Logger:     logger,
			})
			w.Header().Set(TraceHeader, traceID)
			next.ServeHTTP(w, presentation.WithContext(r, ctx))
		})
	}
	handler := cors(settings.WebOrigins, securityWiring.Authentication.Middleware(withContext(mux)))

	// The administrator account the settings describe, created before the first request.
	if settings.AdminAccount != nil {
		if _, err := securityWiring.RegisterAdmin(settings.AdminAccount.Identifier, settings.AdminAccount.Password, eventBus); err != nil && logger != nil {
			logger.Error("The administrator could not be registered", err, nil)
		}
	}

	return &App{Handler: handler, eventBus: eventBus, logger: logger, port: settings.Port}, nil
}

// cors lets a front end served from another origin call the API with a bearer token, never a
// cookie, for the origins the settings allow; with none, the API answers same-origin clients only.
func cors(origins []string, next http.Handler) http.Handler {
	if len(origins) == 0 {
		return next
	}
	allowed := map[string]bool{}
	for _, origin := range origins {
		allowed[origin] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Expose-Headers", TraceHeader)
			if r.Method == http.MethodOptions {
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "authorization, content-type, hx-request, hx-target, hx-trigger, hx-current-url, hx-boosted, hx-push-url")
				w.Header().Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// Running is the application, serving.
type Running struct {
	// Address is http://127.0.0.1:<port>.
	Address  string
	server   *http.Server
	eventBus *trackerinfra.TrackedEventBus
	done     chan error
}

// Start listens on the port of the settings; port -1 means the settings', 0 asks the OS for a
// free one (tests).
func (a *App) Start(port int) (*Running, error) {
	if port < 0 {
		port = a.port
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return nil, err
	}
	server := &http.Server{Handler: a.Handler, ReadHeaderTimeout: 10 * time.Second}
	running := &Running{Address: "http://" + listener.Addr().String(), server: server, eventBus: a.eventBus, done: make(chan error, 1)}
	go func() { running.done <- server.Serve(listener) }()
	if a.logger != nil {
		a.logger.Info("Listening on "+running.Address, nil)
	}
	return running, nil
}

// Wait serves until the transport ends.
func (r *Running) Wait() error {
	err := <-r.done
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

// Stop stops serving: the dispatches in flight finish, then the server exits.
func (r *Running) Stop() error {
	r.eventBus.Settle()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.server.Shutdown(ctx); err != nil && !strings.Contains(err.Error(), "closed") {
		return err
	}
	<-r.done
	return nil
}
