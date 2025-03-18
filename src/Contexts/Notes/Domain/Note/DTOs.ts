export interface INote {
  _id: string;
  ownerId: string;
  title: string;
  content: string;
}

export type INewNote = Omit<INote, '_id'>;
