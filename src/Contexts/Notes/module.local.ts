import { Module } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { IBookmark } from '@Contexts/Notes/Domain/Bookmark/DTOs';
import { NoteCreatedEvent, NoteSharedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import {
  BookmarkNoteCommandEvent,
  BookmarkNoteCommandHandler,
  CreateNoteCommandEvent,
  CreateNoteCommandHandler,
  EditNoteCommandEvent,
  EditNoteCommandHandler,
  ArchiveNoteCommandEvent,
  ArchiveNoteCommandHandler,
  RemoveBookmarkCommandEvent,
  RemoveBookmarkCommandHandler,
  RestoreNoteCommandEvent,
  RestoreNoteCommandHandler,
  ShareNoteCommandEvent,
  ShareNoteCommandHandler,
  SuggestNoteTitleCommandEvent,
  SuggestNoteTitleCommandHandler,
} from '@Contexts/Notes/Application/Commands';
import {
  GetMyBookmarksQueryHandler,
  GetMyNotesQueryHandler,
  GetNoteQueryHandler,
  GetNotesSharedWithMeQueryHandler,
} from '@Contexts/Notes/Application/Queries';
import { NoteCreatedHandler } from '@Contexts/Notes/Application/Events/NoteCreatedHandler';
import { NoteSharedHandler } from '@Contexts/Notes/Application/Events/NoteSharedHandler';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { InMemoryBookmarkQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryBookmarkQueries';
import { InMemoryBookmarkRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryBookmarkRepository';
import { SecurityAccountDirectory } from '@Contexts/Notes/Infrastructure/Directories/SecurityAccountDirectory';
import { FirstLineTitleSuggestions } from '@Contexts/Notes/Infrastructure/Suggestions/FirstLineTitleSuggestions';
import { NoteSharing } from '@Contexts/Notes/Domain/Note/NoteSharing';
import { NoteBookmarking } from '@Contexts/Notes/Domain/Bookmark/NoteBookmarking';
import { accountQueries } from '@Contexts/Security/module.local';

// Write side and read side share the same store here; a real deployment may split them.
const noteDataSource = new InMemoryDataSource<INote>();
const noteRepository = new InMemoryNoteRepository(noteDataSource);
const noteQueries = new InMemoryNoteQueries(noteDataSource);

// Bookmarks are their own aggregate, so their own store; the read side joins it with the notes.
const bookmarkDataSource = new InMemoryDataSource<IBookmark>();
const bookmarkRepository = new InMemoryBookmarkRepository(bookmarkDataSource);
const bookmarkQueries = new InMemoryBookmarkQueries(bookmarkDataSource, noteDataSource);

// Sharing needs to know whether an account exists: Notes asks through its own port, which the
// infrastructure answers from Security's read model. Notes never imports Security's domain.
const noteSharing = new NoteSharing(new SecurityAccountDirectory(accountQueries));
// Bookmarking needs the collection of bookmarks (at most once per note and account).
const noteBookmarking = new NoteBookmarking(bookmarkRepository);

export const localNotesModule = new Module({
  name: 'Notes',
  commands: [
    { event: CreateNoteCommandEvent, handlers: [new CreateNoteCommandHandler(noteRepository)] },
    { event: EditNoteCommandEvent, handlers: [new EditNoteCommandHandler(noteRepository)] },
    { event: ArchiveNoteCommandEvent, handlers: [new ArchiveNoteCommandHandler(noteRepository)] },
    { event: RestoreNoteCommandEvent, handlers: [new RestoreNoteCommandHandler(noteRepository)] },
    { event: ShareNoteCommandEvent, handlers: [new ShareNoteCommandHandler(noteRepository, noteSharing)] },
    // The one non-deterministic source of the context, behind a port (ADR 7); a model would go here.
    {
      event: SuggestNoteTitleCommandEvent,
      handlers: [new SuggestNoteTitleCommandHandler(noteRepository, new FirstLineTitleSuggestions())],
    },
    {
      event: BookmarkNoteCommandEvent,
      handlers: [new BookmarkNoteCommandHandler(noteRepository, bookmarkRepository, noteBookmarking)],
    },
    { event: RemoveBookmarkCommandEvent, handlers: [new RemoveBookmarkCommandHandler(bookmarkRepository)] },
  ],
  queries: [
    new GetMyNotesQueryHandler(noteQueries),
    new GetNoteQueryHandler(noteQueries),
    new GetNotesSharedWithMeQueryHandler(noteQueries),
    new GetMyBookmarksQueryHandler(bookmarkQueries),
  ],
  domainEvents: [
    { event: NoteCreatedEvent, handlers: [new NoteCreatedHandler()] },
    { event: NoteSharedEvent, handlers: [new NoteSharedHandler()] },
  ],
});
