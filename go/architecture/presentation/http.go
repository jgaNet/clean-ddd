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

// Accept accepts a command: the operation exists, its id is answered with 202, and its dispatch
// runs in the background with this request's context. The handling itself is the handlers' business.
func Accept(w http.ResponseWriter, ctx *application.ExecutionContext, command domain.Event) {
	operation := ctx.Publish(command)
	WriteJSON(w, http.StatusAccepted, map[string]string{"operationId": operation.ID})
}

// StatusOf is the status a refusal's kind deserves when the context has no more specific answer.
func StatusOf(err error) int {
	switch {
	case domain.IsNotAllowed(err):
		return http.StatusForbidden
	case domain.IsNotFound(err):
		return http.StatusNotFound
	default:
		return http.StatusBadRequest
	}
}

// Refuse answers { message } with the status that says why.
func Refuse(w http.ResponseWriter, err error, status int) {
	if status == 0 {
		status = StatusOf(err)
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
