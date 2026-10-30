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

/** A reminder its owner scheduled on a note, in Notes' public words. */
export interface ReminderScheduledPayload {
  noteId: string;
  /** The note's title when the reminder was scheduled. */
  noteTitle: string;
  ownerId: string;
  /** The moment to remind, as an ISO 8601 string. */
  remindAt: string;
}

/** A reminder that will not be told: replaced by another, or its note archived. */
export interface ReminderCancelledPayload {
  noteId: string;
  ownerId: string;
  /** The moment of the reminder cancelled, as an ISO 8601 string. */
  remindAt: string;
  /** When it was cancelled, as an ISO 8601 string: a reminder whose moment had come by then was told, and stays. */
  cancelledAt: string;
}

/** Published by Notes each time an owner schedules a reminder (after cancelling the one it replaces). */
export class ReminderScheduledIntegrationEvent extends IntegrationEvent<ReminderScheduledPayload> {}

/** Published by Notes when a reminder is replaced, or its note archived, whether or not its moment has come. */
export class ReminderCancelledIntegrationEvent extends IntegrationEvent<ReminderCancelledPayload> {}
