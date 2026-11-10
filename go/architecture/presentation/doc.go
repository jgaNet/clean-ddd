// Package presentation holds what every route does with a command, a refusal, a format and the
// request's context, on the standard library's net/http: Accept answers 202 { operationId }, or
// 401 at once to a caller who is not signed in (API-CALLER-AT-TRANSPORT), Refuse answers
// { message } with the status a refusal deserves for the caller, ContextOf reads the per-request
// context the composition root's middleware set, and a ByFormat picks the JSON or the HTMX
// presenter from the HX-Request header.
package presentation
