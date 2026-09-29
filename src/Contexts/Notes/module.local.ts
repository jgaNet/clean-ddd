import { Module } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteCreatedEvent, NoteSharedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import {
  CreateNoteCommandEvent,
  CreateNoteCommandHandler,
  EditNoteCommandEvent,
  EditNoteCommandHandler,
  ArchiveNoteCommandEvent,
  ArchiveNoteCommandHandler,
  RestoreNoteCommandEvent,
  RestoreNoteCommandHandler,
  ShareNoteCommandEvent,
  ShareNoteCommandHandler,
  SuggestNoteTitleCommandEvent,
  SuggestNoteTitleCommandHandler,
} from '@Contexts/Notes/Application/Commands';
import {
  GetMyNotesQueryHandler,
  GetNoteQueryHandler,
  GetNotesSharedWithMeQueryHandler,
} from '@Contexts/Notes/Application/Queries';
import { NoteCreatedHandler } from '@Contexts/Notes/Application/Events/NoteCreatedHandler';
import { NoteSharedHandler } from '@Contexts/Notes/Application/Events/NoteSharedHandler';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { SecurityAccountDirectory } from '@Contexts/Notes/Infrastructure/Directories/SecurityAccountDirectory';
import { FirstLineTitleSuggestions } from '@Contexts/Notes/Infrastructure/Suggestions/FirstLineTitleSuggestions';
import { NoteSharing } from '@Contexts/Notes/Domain/Note/NoteSharing';
import { accountQueries } from '@Contexts/Security/module.local';

// Write side and read side share the same store here; a real deployment may split them.
const noteDataSource = new InMemoryDataSource<INote>();
const noteRepository = new InMemoryNoteRepository(noteDataSource);
const noteQueries = new InMemoryNoteQueries(noteDataSource);

// Sharing needs to know whether an account exists: Notes asks through its own port, which the
// infrastructure answers from Security's read model. Notes never imports Security's domain.
const noteSharing = new NoteSharing(new SecurityAccountDirectory(accountQueries));

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
  ],
  queries: [
    new GetMyNotesQueryHandler(noteQueries),
    new GetNoteQueryHandler(noteQueries),
    new GetNotesSharedWithMeQueryHandler(noteQueries),
  ],
  domainEvents: [
    { event: NoteCreatedEvent, handlers: [new NoteCreatedHandler()] },
    { event: NoteSharedEvent, handlers: [new NoteSharedHandler()] },
  ],
});
