import { Event, EventHandler, CommandHandler, IResult } from '@SharedKernel/Domain';
import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note';
import { CreateNoteCommandEvent } from '@Contexts/Notes/Application/Commands/CreateNote';
import { GetNotesQueryHandler } from '@Contexts/Notes/Application/Queries/GetNotes';
import { INote } from '@Contexts/Notes/Domain/Note';
import { INewNote } from '@Contexts/Notes/Domain/Note/DTOs';

export type CreateNoteCommandPort = Omit<INewNote, 'ownerId'>;
export type GetNotesQueryResult = IResult<INote[]>;

export type Subscription<T> = { event: Event<T>; handlers: EventHandler<Event<T>>[] };
export type Subscriptions<T> = Subscription<T>[];

export type ModuleSubscriptions = {
  domain: Subscriptions<unknown>;
};

export type NotesModuleCommands = [
  { event: typeof CreateNoteCommandEvent; handlers: CommandHandler<CreateNoteCommandEvent>[] },
];

export type NotesModuleQueries = [{ name: typeof GetNotesQueryHandler.name; handler: GetNotesQueryHandler }];
export type NotesModuleDomainEvents = [{ event: typeof NoteCreatedEvent; handlers: EventHandler<NoteCreatedEvent>[] }];
export type NotesModuleIntegrationEvents = [];
export type NotesModuleServices = Record<string, unknown>;
