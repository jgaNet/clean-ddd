import { NotesModule } from '@Contexts/Notes/Application';
import { NoteCreatedHandler } from '@Contexts/Notes/Application/Events/NoteCreatedHandler';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteCreatedEvent';
import { MockedNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/MockedNoteRepository';
import { MockedNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/MockedNoteQueries';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandEvent';

import { CreateNoteCommandHandler } from '@Contexts/Notes/Application/Commands/CreateNote/CreateNoteCommandHandler';
import { GetNotesQueryHandler } from '@Contexts/Notes/Application/Queries/GetNotes/GetNotesQueryHandler';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { INote } from '@Contexts/Notes/Domain/Note/DTOs';

import { ModuleBuilder } from '@SharedKernel/Domain/Application';

export const inMemoryDataSource = new InMemoryDataSource<INote>();
export const mockedNoteRepository = new MockedNoteRepository(inMemoryDataSource);
export const mockedNoteQueries = new MockedNoteQueries(inMemoryDataSource);

const createNoteCommandHandler = new CreateNoteCommandHandler({
  noteRepository: mockedNoteRepository,
  noteQueries: mockedNoteQueries,
});

const getNotesQueryHandler = new GetNotesQueryHandler(mockedNoteQueries);

const noteModuleName = Symbol('notes');
export const mockNotesModule = new ModuleBuilder<NotesModule>(noteModuleName)
  .setCommand({
    event: CreateNoteCommandEvent,
    handlers: [createNoteCommandHandler],
  })
  .setQuery(getNotesQueryHandler)
  .setDomainEvent({ event: NoteCreatedEvent, handlers: [new NoteCreatedHandler()] })
  .build();
