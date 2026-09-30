import { IntegrationEvent } from '@Architecture/Domain/EventTypes';

/**
 * The published contract of the Notes context: what other contexts may know about notes.
 *
 * It is deliberately not the NoteSharedEvent of the Notes domain. A domain event can change
 * whenever the Note aggregate changes; an integration event is a promise to other contexts
 * and evolves with care. Notes translates one into the other (NoteSharedHandler); the
 * receiving context reads only this.
 */
export class NoteSharedIntegrationEvent extends IntegrationEvent<{
  noteId: string;
  title: string;
  ownerId: string;
  recipientId: string;
}> {}

/**
 * A note was reacted to for the first time. Notes publishes it only once per note, because it
 * is the only side that can tell a first reaction from the next ones; a context that listens
 * needs no memory of its own.
 */
export class NoteFirstReactionIntegrationEvent extends IntegrationEvent<{
  noteId: string;
  title: string;
  ownerId: string;
  reactorId: string;
  emoji: string;
}> {}
