// Package presentation holds the REST routes of the Notes context, on net/http. Commands are
// accepted (202) through presentation.Accept and processed through the event bus; the client
// follows the returned operation, and a caller who is not signed in is refused at once with 401,
// before anything is published (API-CALLER-AT-TRANSPORT). Queries answer synchronously, through
// a view of the read model, or are refused with the status the refusal deserves: the context
// maps its own kinds first (NoteNotFound is a 404) and falls back on StatusOf (401 to a caller
// who is not signed in, 403 to one the rule refuses).
package presentation
