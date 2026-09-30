import { IResult } from '@Architecture/Domain';

import { NoteReaction } from '@Contexts/Notes/Domain/NoteReaction/NoteReaction';

/**
 * The write side of a reaction's persistence: aggregates in, aggregates out.
 *
 * Beyond load and save it answers the two facts about the whole collection that the rules of
 * NoteReacting are checked against — a rule on the write side is checked against what is
 * saved, not against a screen (DOMAIN-IDENTITY). Listing reactions for a screen is
 * INoteReactionQueries' job.
 */
export interface INoteReactionRepository {
  findById(id: string): Promise<NoteReaction | null>;
  /**
   * The reaction this person already left on this note, or null when they have not reacted
   * yet: what "one reaction per person per note" is checked against.
   */
  findByNoteAndReactor(noteId: string, reactorId: string): Promise<NoteReaction | null>;
  /** How many people have reacted to this note; 0 for a note nobody reacted to, or an unknown one. */
  countByNote(noteId: string): Promise<number>;
  /**
   * Stores the aggregate at version + 1, or refuses it with a ConcurrencyConflictException when
   * the stored version is no longer the one it was loaded with (ADR 8). The contract spec
   * asserts it for every adapter.
   */
  save(reaction: NoteReaction): Promise<IResult>;
}
