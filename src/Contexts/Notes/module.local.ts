import { Module } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteCreatedEvent, NoteSharedEvent } from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import { INoteReaction } from '@Contexts/Notes/Domain/NoteReaction/DTOs';
import { NoteReactedEvent } from '@Contexts/Notes/Domain/NoteReaction/Events/NoteReactionEvents';
import {
  CreateNoteCommandEvent,
  CreateNoteCommandHandler,
  EditNoteCommandEvent,
  EditNoteCommandHandler,
  ArchiveNoteCommandEvent,
  ArchiveNoteCommandHandler,
  ReactToNoteCommandEvent,
  ReactToNoteCommandHandler,
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
  GetNoteReactionsQueryHandler,
  GetNotesSharedWithMeQueryHandler,
} from '@Contexts/Notes/Application/Queries';
import { NoteCreatedHandler } from '@Contexts/Notes/Application/Events/NoteCreatedHandler';
import { NoteReactedHandler } from '@Contexts/Notes/Application/Events/NoteReactedHandler';
import { NoteSharedHandler } from '@Contexts/Notes/Application/Events/NoteSharedHandler';
import { InMemoryNoteQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteQueries';
import { InMemoryNoteReactionQueries } from '@Contexts/Notes/Infrastructure/Queries/InMemoryNoteReactionQueries';
import { InMemoryNoteRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteRepository';
import { InMemoryNoteReactionRepository } from '@Contexts/Notes/Infrastructure/Repositories/InMemoryNoteReactionRepository';
import { SecurityAccountDirectory } from '@Contexts/Notes/Infrastructure/Directories/SecurityAccountDirectory';
import { FirstLineTitleSuggestions } from '@Contexts/Notes/Infrastructure/Suggestions/FirstLineTitleSuggestions';
import { NoteSharing } from '@Contexts/Notes/Domain/Note/NoteSharing';
import { NoteReacting } from '@Contexts/Notes/Domain/NoteReaction/NoteReacting';
import { accountQueries } from '@Contexts/Security/module.local';

// Write side and read side share the same store here; a real deployment may split them.
const noteDataSource = new InMemoryDataSource<INote>();
const noteRepository = new InMemoryNoteRepository(noteDataSource);
const noteQueries = new InMemoryNoteQueries(noteDataSource);

// Reactions are their own aggregate, so they have their own store; the read side of a note's
// reactions reads both, which is a read model's freedom (ADR 5).
const noteReactionDataSource = new InMemoryDataSource<INoteReaction>();
const noteReactionRepository = new InMemoryNoteReactionRepository(noteReactionDataSource);
const noteReactionQueries = new InMemoryNoteReactionQueries(noteDataSource, noteReactionDataSource);

// Sharing needs to know whether an account exists: Notes asks through its own port, which the
// infrastructure answers from Security's read model. Notes never imports Security's domain.
const noteSharing = new NoteSharing(new SecurityAccountDirectory(accountQueries));
// Reacting needs the facts about the collection its rules are checked against.
const noteReacting = new NoteReacting(noteReactionRepository);

export const localNotesModule = new Module({
  name: 'Notes',
  commands: [
    { event: CreateNoteCommandEvent, handlers: [new CreateNoteCommandHandler(noteRepository)] },
    { event: EditNoteCommandEvent, handlers: [new EditNoteCommandHandler(noteRepository)] },
    { event: ArchiveNoteCommandEvent, handlers: [new ArchiveNoteCommandHandler(noteRepository)] },
    { event: RestoreNoteCommandEvent, handlers: [new RestoreNoteCommandHandler(noteRepository)] },
    { event: ShareNoteCommandEvent, handlers: [new ShareNoteCommandHandler(noteRepository, noteSharing)] },
    {
      event: ReactToNoteCommandEvent,
      handlers: [new ReactToNoteCommandHandler(noteRepository, noteReactionRepository, noteReacting)],
    },
    // The one non-deterministic source of the context, behind a port (ADR 7); a model would go here.
    {
      event: SuggestNoteTitleCommandEvent,
      handlers: [new SuggestNoteTitleCommandHandler(noteRepository, new FirstLineTitleSuggestions())],
    },
  ],
  queries: [
    new GetMyNotesQueryHandler(noteQueries),
    new GetNoteQueryHandler(noteQueries),
    new GetNoteReactionsQueryHandler(noteReactionQueries),
    new GetNotesSharedWithMeQueryHandler(noteQueries),
  ],
  domainEvents: [
    { event: NoteCreatedEvent, handlers: [new NoteCreatedHandler()] },
    { event: NoteSharedEvent, handlers: [new NoteSharedHandler()] },
    // NoteReactionChangedEvent has no handler: nothing reacts to it yet.
    { event: NoteReactedEvent, handlers: [new NoteReactedHandler(noteQueries)] },
  ],
});
