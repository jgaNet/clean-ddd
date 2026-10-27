// Package notes is the wiring of the Notes context: the one place its handlers are bound to
// its adapters and listed in a Module. Plain data: construct the handler, pass its ports, list
// it (ARCH-MODULES-DATA). Anything else the context exposes is a name of this file.
//
// Sharing needs to know whether an account exists: Notes asks through its own port, which the
// composition root answers with an adapter over Security's read model. Notes never imports
// Security; the directory comes in as a parameter, which is where the two contexts meet.
package notes

import (
	"clean-ddd/architecture/application"
	"clean-ddd/architecture/infrastructure"
	"clean-ddd/contexts/notes/application/commands"
	"clean-ddd/contexts/notes/application/events"
	"clean-ddd/contexts/notes/application/queries"
	"clean-ddd/contexts/notes/domain/note"
	notesinfra "clean-ddd/contexts/notes/infrastructure"
)

// NoteStore is the context's store, which the composition root hands to the unit of work.
type NoteStore = infrastructure.InMemoryDataSource[note.Snapshot]

func NewNoteStore() *NoteStore {
	return infrastructure.NewInMemoryDataSource[note.Snapshot]()
}

// LocalModule is the Notes module for the local environment: write side and read side share
// the same store here; a real deployment may split them.
func LocalModule(store *NoteStore, accounts note.AccountDirectory) *application.Module {
	repository := notesinfra.NewInMemoryNoteRepository(store)
	noteQueries := notesinfra.NewInMemoryNoteQueries(store)

	return &application.Module{
		Name: "Notes",
		Commands: []application.Subscription{
			application.Command(commands.NewCreateNoteHandler(repository)),
			application.Command(commands.NewEditNoteHandler(repository)),
			application.Command(commands.NewArchiveNoteHandler(repository)),
			application.Command(commands.NewRestoreNoteHandler(repository)),
			application.Command(commands.NewPinNoteHandler(repository)),
			application.Command(commands.NewUnpinNoteHandler(repository)),
			application.Command(commands.NewShareNoteHandler(repository, note.NewSharing(accounts))),
			// The one non-deterministic source of the context, behind a port (ADR 7); a model would go here.
			application.Command(commands.NewSuggestNoteTitleHandler(repository, notesinfra.FirstLineTitleSuggestions{})),
		},
		Queries: []any{
			queries.NewGetMyNotesHandler(noteQueries),
			queries.NewGetNoteHandler(noteQueries),
			queries.NewGetNotesSharedWithMeHandler(noteQueries),
		},
		DomainEvents: []application.Subscription{
			application.Reaction(events.NoteCreatedHandler{}),
			application.Reaction(events.NoteSharedHandler{}),
		},
	}
}
