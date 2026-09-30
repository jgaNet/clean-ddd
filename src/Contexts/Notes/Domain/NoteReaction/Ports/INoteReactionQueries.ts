/**
 * Read models for the reactions of a note. They are shapes for a screen, never aggregates
 * (ADR 5).
 */
export interface NoteReactionListItem {
  reactorId: string;
  emoji: string;
}

/**
 * The reactions of one note, together with who the note is for.
 *
 * The audience is here so that the *handler* can apply the visibility rule ("you see the
 * reactions of a note you can read") with one port and no aggregate: the adapter is free to
 * answer from the notes store and the reactions store at once, which is the freedom ADR 5
 * gives the read side. The audience never leaves the handler.
 */
export interface NoteReactionsView {
  noteId: string;
  ownerId: string;
  sharedWith: string[];
  reactions: NoteReactionListItem[];
}

export interface INoteReactionQueries {
  /**
   * The reactions of a note, oldest first — the order people first reacted, which changing an
   * emoji does not disturb. Ordering is part of this contract: the contract spec asserts it
   * for every adapter. null when there is no such note.
   */
  findByNote(noteId: string): Promise<NoteReactionsView | null>;
}
