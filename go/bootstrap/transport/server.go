// Package transport is the HTTP server of an application, and nothing of its business: it gives
// each request its identity and its ExecutionContext, lets the front ends of the origins it is
// given call it (CORS), serves the routes it is given under one API prefix, and listens. It
// names no context; a composition root (create_application.go) builds one over the bus it
// started its modules on, mounts each context's routes, and starts it.
package transport

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
	kernel "clean-ddd/sharedkernel/domain"
)

// TraceHeader carries the trace of a request: the caller's, or a new one, and it is answered back.
const TraceHeader = "x-trace-id"

// Anonymous is who a caller is until an authentication says otherwise: a guest.
var Anonymous = application.Auth{Role: string(kernel.RoleGuest)}

// Options is what a composition root decides about its transport.
type Options struct {
	Logger application.Logger
	// APIPrefix is what every route is served under: "v1" serves /notes at /v1/notes.
	APIPrefix string
	// Port is what Start listens on when it is given -1; 0 asks the OS for a free one.
	Port int
	// WebOrigins are the origins a front end may call the API from (CORS); none: same-origin clients only.
	WebOrigins []string
	// Stores are what the unit of work of each request snapshots; none: every store of the process.
	Stores []infrastructure.Snapshotter
	// Authenticate says who is calling; the context that owns accounts provides it. Without one,
	// every caller is anonymous.
	Authenticate func(r *http.Request) application.Auth
}

// Routes is a context's routes, as its presentation package's Routes registers them: on the
// mux, under the prefix, answered by the module.
type Routes func(mux *http.ServeMux, prefix string, module *application.Module)

// Server is the transport: built, its routes mounted; not yet listening.
type Server struct {
	options  Options
	eventBus application.EventBus
	mux      *http.ServeMux
}

// New is a transport over the application's bus, which every request's context publishes on.
func New(eventBus application.EventBus, options Options) *Server {
	return &Server{options: options, eventBus: eventBus, mux: http.NewServeMux()}
}

// Prefix is the API prefix as a path: "/v1".
func (s *Server) Prefix() string { return "/" + strings.Trim(s.options.APIPrefix, "/") }

// Routes mounts a context's routes under /<APIPrefix><prefix>; "" or "/" serves them at the API prefix itself.
func (s *Server) Routes(prefix string, routes Routes, module *application.Module) *Server {
	routes(s.mux, s.Prefix()+strings.TrimSuffix(prefix, "/"), module)
	return s
}

// Mux is the server's mux, for what a composition root serves itself: a page of its own under
// the prefix, a websocket beside it. The request's context is on every request it serves.
func (s *Server) Mux() *http.ServeMux { return s.mux }

// CallerOf is who is calling, as the transport established it for this request.
func CallerOf(r *http.Request) application.Auth { return presentation.ContextOf(r).Auth() }

// Handler is the whole transport, from the outermost in: CORS, then the request's identity and
// context, then the routes.
func (s *Server) Handler() http.Handler {
	return cors(s.options.WebOrigins, s.withContext(s.mux))
}

// withContext builds one execution context per request: its trace, its caller, and its own unit
// of work. A unit of work is a request-scoped thing; sharing one instance across requests would
// make concurrent commands join each other's transaction.
func (s *Server) withContext(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		traceID := r.Header.Get(TraceHeader)
		if traceID == "" {
			traceID = domain.GenerateID().Value()
		}
		caller := Anonymous
		if s.options.Authenticate != nil {
			caller = s.options.Authenticate(r)
		}
		ctx := application.NewExecutionContext(application.Options{
			TraceID:    traceID,
			Auth:       caller,
			EventBus:   s.eventBus,
			UnitOfWork: infrastructure.NewInMemoryUnitOfWork(s.options.Stores...),
			Logger:     s.options.Logger,
		})
		w.Header().Set(TraceHeader, traceID)
		next.ServeHTTP(w, presentation.WithContext(r, ctx))
	})
}

// cors lets a front end served from another origin call the API with a bearer token, never a
// cookie, for the origins given; with none, the API answers same-origin clients only.
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
	Address string
	// API is the base URL of the API: http://127.0.0.1:<port>/v1.
	API      string
	server   *http.Server
	eventBus application.EventBus
	done     chan error
}

// Start listens on 127.0.0.1: port -1 means the options', 0 asks the OS for a free one (tests).
func (s *Server) Start(port int) (*Running, error) {
	if port < 0 {
		port = s.options.Port
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return nil, err
	}
	server := &http.Server{Handler: s.Handler(), ReadHeaderTimeout: 10 * time.Second}
	address := "http://" + listener.Addr().String()
	running := &Running{Address: address, API: address + s.Prefix(), server: server, eventBus: s.eventBus, done: make(chan error, 1)}
	go func() { running.done <- server.Serve(listener) }()
	if s.options.Logger != nil {
		s.options.Logger.Info("Listening on "+running.Address, nil)
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
	if bus, ok := r.eventBus.(interface{ Settle() }); ok {
		bus.Settle()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := r.server.Shutdown(ctx); err != nil && !strings.Contains(err.Error(), "closed") {
		return err
	}
	<-r.done
	return nil
}
