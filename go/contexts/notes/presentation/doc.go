// Package presentation holds the REST routes of the Notes context, on net/http. Commands are
// accepted (202) and processed through the event bus; the client follows the returned
// operation. Queries answer synchronously, through a view of the read model, or are refused
// with the status the refusal deserves: the context maps its own kinds first (NoteNotFound is
// a 404) and falls back on StatusOf.
package presentation
