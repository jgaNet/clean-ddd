import { Module } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
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
} from '@Contexts/Notes/Application/Commands';
import {
  GetMyNotesQueryHandler,
  GetNoteQueryHandler,
  GetNotesSharedWithMeQueryHandler,
} from '@Contexts/Notes/Application/Queries';
import { NoteCreatedHandler } from '@Contexts/Notes/Application/Events/NoteCreatedHandler';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';

// Write side and read side share the same store here; a real deployment may split them.
const noteDataSource = new InMemoryDataSource<INote>();
const noteRepository = new InMemoryNoteRepository(noteDataSource);
const noteQueries = new InMemoryNoteQueries(noteDataSource);

export const localNotesModule = new Module({
  name: 'Notes',
  commands: [
    { event: CreateNoteCommandEvent, handlers: [new CreateNoteCommandHandler(noteRepository)] },
    { event: EditNoteCommandEvent, handlers: [new EditNoteCommandHandler(noteRepository)] },
    { event: ArchiveNoteCommandEvent, handlers: [new ArchiveNoteCommandHandler(noteRepository)] },
    { event: RestoreNoteCommandEvent, handlers: [new RestoreNoteCommandHandler(noteRepository)] },
    { event: ShareNoteCommandEvent, handlers: [new ShareNoteCommandHandler(noteRepository)] },
  ],
  queries: [
    new GetMyNotesQueryHandler(noteQueries),
    new GetNoteQueryHandler(noteQueries),
    new GetNotesSharedWithMeQueryHandler(noteQueries),
  ],
  domainEvents: [{ event: NoteCreatedEvent, handlers: [new NoteCreatedHandler()] }],
});
