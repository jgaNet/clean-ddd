/**
 * Snapshot of a NoteReaction: the plain data the aggregate is persisted as and rebuilt from.
 *
 * It holds the reaction and nothing of the note it is about: the note's title and owner belong
 * to the Note aggregate, which is free to change them without touching a reaction.
 */
export interface INoteReaction {
  _id: string;
  noteId: string;
  reactorId: string;
  emoji: string;
  /** When the person first reacted; changing their emoji does not move it. */
  reactedAt: Date;
  /** The version this snapshot was read at; the repository stores version + 1 (ADR 8). */
  version: number;
}

/**
 * What is needed to record a brand new reaction.
 *
 * `firstOnNote` is a fact about the whole collection of reactions, which no single reaction
 * can see: NoteReacting establishes it through the repository and hands it in, so that the
 * recorded event can say whether this is the note's first reaction.
 */
export interface INewNoteReaction {
  noteId: string;
  reactorId: string;
  emoji: string;
  firstOnNote: boolean;
}
