package presentation

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"clean-ddd/architecture/application"
	"clean-ddd/architecture/domain"
)

// Accept is the one way a route publishes a command whose outcome is read later
// (API-CALLER-AT-TRANSPORT, ADR 39): the operation exists, its id is answered with
// 202 { operationId }, and its dispatch runs in the background with this request's context. To a
// caller who is not signed in, unless the handler the module lists for the command says anyone
// may ask for it (application.OpenToAnyone), it answers 401 { message } and publishes nothing:
// the client learns at once that it must sign in, instead of following an operation that was
// never going to succeed. The conventions check refuses a route that publishes, or answers 202,
// by itself.
//
// What a signed-in caller may do is not decided here: the handler still asks for its caller's
// id, and the aggregate still refuses what that caller may not do, on the operation. A command
// answered at once (a login) does not come through here and keeps its own refusal.
//
//	mux.HandleFunc("POST "+prefix+"/{id}/archive", func(w http.ResponseWriter, r *http.Request) {
//		presentation.Accept(w, r, module, commands.ArchiveNoteCommandEvent{NoteID: r.PathValue("id")})
//	})
func Accept(w http.ResponseWriter, r *http.Request, module *application.Module, command domain.Event) {
	ctx := ContextOf(r)
	if !ctx.Auth().SignedIn() && !module.AnyoneMayAsk(command) {
		WriteJSON(w, http.StatusUnauthorized, map[string]string{"message": AuthenticationRequired})
		return
	}
	operation := ctx.Publish(command)
	WriteJSON(w, http.StatusAccepted, map[string]string{"operationId": operation.ID})
}

// AuthenticationRequired is the message of a 401, the same on every route.
const AuthenticationRequired = "Authentication required"

// NotAllowedStatus is the status of a refusal a query answers at once (domain.IsNotAllowed): 401
// to a caller who is not signed in, as HTTP says for missing credentials, 403 to a signed-in
// caller the rule refuses. One refusal has one status, for a command and a query alike.
func NotAllowedStatus(ctx *application.ExecutionContext) int {
	if ctx.Auth().SignedIn() {
		return http.StatusForbidden
	}
	return http.StatusUnauthorized
}

// StatusOf is the status a refusal's kind deserves, for this caller, when the context has no
// more specific answer.
func StatusOf(ctx *application.ExecutionContext, err error) int {
	switch {
	case domain.IsNotAllowed(err):
		return NotAllowedStatus(ctx)
	case domain.IsNotFound(err):
		return http.StatusNotFound
	default:
		return http.StatusBadRequest
	}
}

// Refuse answers { message } with the status given, or, given 0, the one the refusal deserves for this caller.
func Refuse(w http.ResponseWriter, ctx *application.ExecutionContext, err error, status int) {
	if status == 0 {
		status = StatusOf(ctx, err)
	}
	WriteJSON(w, status, map[string]string{"message": err.Error()})
}

type contextKey struct{}

// WithContext attaches the per-request execution context to the request, for the middleware.
func WithContext(r *http.Request, ctx *application.ExecutionContext) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), contextKey{}, ctx))
}

// ContextOf is the per-request context the composition root's middleware built. Its absence is
// a wiring error and panics.
func ContextOf(r *http.Request) *application.ExecutionContext {
	ctx, ok := r.Context().Value(contextKey{}).(*application.ExecutionContext)
	if !ok {
		panic("no execution context on the request: the bootstrap's middleware is missing")
	}
	return ctx
}

// ErrMalformedBody is what DecodeBody answers for a body that is not the JSON the route expects.
var ErrMalformedBody = errors.New("malformed request body")

// DecodeBody reads a JSON body into the route's own struct; a body that does not parse is a
// 400 with { message }, answered here, and the route returns.
func DecodeBody(w http.ResponseWriter, r *http.Request, body any) bool {
	decoder := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := decoder.Decode(body); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"message": ErrMalformedBody.Error()})
		return false
	}
	return true
}
