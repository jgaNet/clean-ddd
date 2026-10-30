import { IntegrationEvent } from '@Architecture/Domain/EventTypes';

/** The note its owner archived, in Notes' public words, with the accounts it was shared with at that moment. */
export interface NoteArchivedPayload {
  noteId: string;
  noteTitle: string;
  ownerId: string;
  /** Every account the note was shared with when it was archived; empty when it was shared with nobody. */
  recipientIds: string[];
  /** When it was archived, as an ISO 8601 string. */
  archivedAt: string;
}

/**
 * Published by Notes each time an owner archives a note, whether or not anyone listens: one fact,
 * one message, the fan-out to recipients is the consumer's business.
 */
export class NoteArchivedIntegrationEvent extends IntegrationEvent<NoteArchivedPayload> {}
