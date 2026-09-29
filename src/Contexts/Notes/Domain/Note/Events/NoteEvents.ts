import { DomainEvent } from '@SharedKernel/Domain';

/**
 * Domain events are facts, named in the past tense, raised by the Note aggregate when
 * something meaningful happened. They carry just enough data for a listener to react.
 *
 * They stay inside the Notes context. When another context must know, an application
 * handler translates them into an integration event (see Application/Events).
 */

export class NoteCreatedEvent extends DomainEvent<{ noteId: string; ownerId: string; title: string }> {}

export class NoteEditedEvent extends DomainEvent<{ noteId: string; title: string }> {}

/**
 * Carries who had access when the note was archived: the accounts it was shared with are
 * told it is no longer available, and a listener must not have to load the note to know them.
 */
export class NoteArchivedEvent extends DomainEvent<{
  noteId: string;
  title: string;
  ownerId: string;
  sharedWith: string[];
}> {}

export class NoteRestoredEvent extends DomainEvent<{ noteId: string }> {}

export class NoteSharedEvent extends DomainEvent<{
  noteId: string;
  title: string;
  ownerId: string;
  recipientId: string;
}> {}
