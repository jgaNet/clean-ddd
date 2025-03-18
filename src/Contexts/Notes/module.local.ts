import { CreateNoteCommandEvent, CreateNoteCommandHandler } from '@Contexts/Notes/Application/Commands/CreateNote';

import { GetNotesQueryHandler } from '@Contexts/Notes/Application/Queries/GetNotes/GetNotesQueryHandler';
import { INote } from '@Contexts/Notes/Domain/Note';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note';
import { NoteCreatedHandler } from '@Contexts/Notes/Application/Events/NoteCreatedHandler';
import { NotesModule } from '@Contexts/Notes/Application';
import { ModuleBuilder } from '@SharedKernel/Domain/Application';

const inMemoryDataSource = new InMemoryDataSource<INote>();
const noteRepository = new InMemoryNoteRepository(inMemoryDataSource);
const noteQueries = new InMemoryNoteQueries(inMemoryDataSource);
const getNotesQueryHandler = new GetNotesQueryHandler(noteQueries);
const createNoteCommandHandler = new CreateNoteCommandHandler({ noteRepository, noteQueries });

export const localNotesModule = new ModuleBuilder<NotesModule>(Symbol('Notes'))
  .setCommand({
    event: CreateNoteCommandEvent,
    handlers: [createNoteCommandHandler],
  })
  .setQuery(getNotesQueryHandler)
  .setDomainEvent({ event: NoteCreatedEvent, handlers: [new NoteCreatedHandler()] })
  .build();
