import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';

/**
 * Snapshot of a Note: the plain data the aggregate is persisted as and rebuilt from.
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
  tags: string[];
}

/** What is needed to write a brand new note. A note may start without tags. */
export type INewNote = Pick<INote, 'ownerId' | 'title' | 'content'> & Partial<Pick<INote, 'tags'>>;
