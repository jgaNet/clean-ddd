import { DomainEvent } from '@Architecture/Domain';

/**
 * The facts a reaction records. They stay inside the Notes context; NoteReactedHandler
 * translates the first of them into the published contract when it is the note's first
 * reaction (Application/Events).
 */

/**
 * Someone reacted to a note they had not reacted to yet. `firstOnNote` says whether the note
 * had never been reacted to before: one fact, one message, and the only place that can know it
 * is here — the consumer that tells the owner would otherwise have to keep its own count.
 */
export class NoteReactedEvent extends DomainEvent<{
  reactionId: string;
  noteId: string;
  reactorId: string;
  emoji: string;
  firstOnNote: boolean;
}> {}

/** Someone replaced the emoji of the reaction they had already left. Nobody listens yet. */
export class NoteReactionChangedEvent extends DomainEvent<{
  reactionId: string;
  noteId: string;
  reactorId: string;
  emoji: string;
}> {}
