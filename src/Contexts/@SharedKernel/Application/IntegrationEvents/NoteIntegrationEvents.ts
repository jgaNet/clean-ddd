import { IntegrationEvent } from '@SharedKernel/Domain/DDD/EventTypes';

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
 * A note was archived. `recipientIds` are the accounts it was shared with at that moment,
 * so a consumer can tell them without asking Notes; empty when it was shared with nobody.
 */
export class NoteArchivedIntegrationEvent extends IntegrationEvent<{
  noteId: string;
  title: string;
  ownerId: string;
  recipientIds: string[];
}> {}
