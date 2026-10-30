import { IntegrationEvent } from '@Architecture/Domain/EventTypes';

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
