/**
 * The read model of a link: the shape the legacy answered, field for field, so that the
 * compatibility wire answers it as it is and the native wire has nothing to add.
 */
export interface LinkView {
  id: string;
  url: string;
  title: string;
  archived: boolean;
  createdAt: string;
}

export interface ILinkQueries {
  /** Any link, archived or not. */
  findById(linkId: string): Promise<LinkView | null>;
  /** The links not archived, newest first — the order the legacy promised its list in. */
  findActive(): Promise<LinkView[]>;
}
