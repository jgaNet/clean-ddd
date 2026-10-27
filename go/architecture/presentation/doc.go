// Package presentation holds what every route does with a command, a refusal, a format and the
// request's context, on the standard library's net/http: Accept answers 202 { operationId },
// Refuse answers { message } with the status a refusal deserves, ContextOf reads the per-request
// context the composition root's middleware set, and a ByFormat picks the JSON or the HTMX
// presenter from the HX-Request header.
package presentation
