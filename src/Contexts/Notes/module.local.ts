import { ModuleBuilder } from '@SharedKernel/Domain/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import { NotesModule } from '@Contexts/Notes/Application';
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

export const localNotesModule = new ModuleBuilder<NotesModule>(Symbol('Notes'))
  .setCommand({ event: CreateNoteCommandEvent, handlers: [new CreateNoteCommandHandler(noteRepository)] })
  .setCommand({ event: EditNoteCommandEvent, handlers: [new EditNoteCommandHandler(noteRepository)] })
  .setCommand({ event: ArchiveNoteCommandEvent, handlers: [new ArchiveNoteCommandHandler(noteRepository)] })
  .setCommand({ event: RestoreNoteCommandEvent, handlers: [new RestoreNoteCommandHandler(noteRepository)] })
  .setCommand({ event: ShareNoteCommandEvent, handlers: [new ShareNoteCommandHandler(noteRepository)] })
  .setQuery(new GetMyNotesQueryHandler(noteQueries))
  .setQuery(new GetNoteQueryHandler(noteQueries))
  .setQuery(new GetNotesSharedWithMeQueryHandler(noteQueries))
  .setDomainEvent({ event: NoteCreatedEvent, handlers: [new NoteCreatedHandler()] })
  .build();
