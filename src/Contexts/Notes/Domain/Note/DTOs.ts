import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';

/** Snapshot of one comment; it only ever appears inside a Note's snapshot. */
export interface INoteComment {
  _id: string;
  authorId: string;
  text: string;
  postedAt: Date;
}

/**
 * Snapshot of a Note: the plain data the aggregate is persisted as and rebuilt from,
 * comments included: the aggregate is persisted as a whole.
 *
 * The aggregate (Note.ts) owns the behaviour and the rules; this type owns nothing.
 * It is the only shape that crosses the domain boundary towards the infrastructure.
 */
export interface INote {
  _id: string;
  ownerId: string;
  title: string;
  content: string;
  status: NoteStatus;
  sharedWith: string[];
  comments: INoteComment[];
}

/** What is needed to write a brand new note. */
export type INewNote = Pick<INote, 'ownerId' | 'title' | 'content'>;
