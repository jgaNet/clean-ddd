import { CommandHandler, EventHandler } from '@SharedKernel/Domain';

import { NoteCreatedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import {
  CreateNoteCommandEvent,
  EditNoteCommandEvent,
  ArchiveNoteCommandEvent,
  RestoreNoteCommandEvent,
  ShareNoteCommandEvent,
} from '@Contexts/Notes/Application/Commands';
import {
  GetMyNotesQueryHandler,
  GetNoteQueryHandler,
  GetNotesSharedWithMeQueryHandler,
} from '@Contexts/Notes/Application/Queries';

export type NotesModuleCommands = [
  { event: typeof CreateNoteCommandEvent; handlers: CommandHandler<CreateNoteCommandEvent>[] },
  { event: typeof EditNoteCommandEvent; handlers: CommandHandler<EditNoteCommandEvent>[] },
  { event: typeof ArchiveNoteCommandEvent; handlers: CommandHandler<ArchiveNoteCommandEvent>[] },
  { event: typeof RestoreNoteCommandEvent; handlers: CommandHandler<RestoreNoteCommandEvent>[] },
  { event: typeof ShareNoteCommandEvent; handlers: CommandHandler<ShareNoteCommandEvent>[] },
];

export type NotesModuleQueries = [
  { name: typeof GetMyNotesQueryHandler.name; handler: GetMyNotesQueryHandler },
  { name: typeof GetNoteQueryHandler.name; handler: GetNoteQueryHandler },
  { name: typeof GetNotesSharedWithMeQueryHandler.name; handler: GetNotesSharedWithMeQueryHandler },
];

export type NotesModuleDomainEvents = [{ event: typeof NoteCreatedEvent; handlers: EventHandler<NoteCreatedEvent>[] }];
export type NotesModuleIntegrationEvents = [];
export type NotesModuleServices = Record<string, unknown>;
