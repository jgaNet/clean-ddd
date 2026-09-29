import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';

/**
 * Read models: the shapes a screen or an API wants to display. They are plain data,
 * tailored to a use case, and they never come back into the domain.
 */
export interface NoteListItem {
  id: string;
  title: string;
  status: NoteStatus;
  pinned: boolean;
}

export interface NoteDetail extends NoteListItem {
  ownerId: string;
  content: string;
  sharedWith: string[];
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
  /** Pinned notes first; within each group, in the order they were saved. Every adapter is held to it by the contract spec. */
  findByOwner(ownerId: string): Promise<NoteListItem[]>;
  findSharedWith(accountId: string): Promise<SharedNoteListItem[]>;
}
