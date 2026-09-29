import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';

/**
 * Read models: the shapes a screen or an API wants to display. They are plain data,
 * tailored to a use case, and they never come back into the domain.
 */
export interface NoteListItem {
  id: string;
  title: string;
  status: NoteStatus;
}

export interface NoteDetail extends NoteListItem {
  ownerId: string;
  content: string;
  sharedWith: string[];
  /** In the order the owner gave them. */
  tags: string[];
}

export interface SharedNoteListItem {
  id: string;
  title: string;
  content: string;
  ownerId: string;
}

/**
 * The queries port is the read side (the "Q" of CQRS). It returns read models, not
 * aggregates, so the read side is free to be shaped, indexed and cached however the
 * screens need, without dragging the business rules along.
 */
export interface INoteQueries {
  findById(noteId: string): Promise<NoteDetail | null>;
  /** In the order they were saved. Ordering is part of this contract: the contract spec asserts it for every adapter. */
  findByOwner(ownerId: string): Promise<NoteListItem[]>;
  /** In the order they were saved. */
  findSharedWith(accountId: string): Promise<SharedNoteListItem[]>;
}
