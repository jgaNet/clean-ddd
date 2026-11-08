/**
 * The activity feed: what happened to the links, as the legacy told it (`GET /activity`). It is
 * a read model written by the policies on the facts the aggregate records, and read by a query;
 * no rule lives in it.
 */
export interface ActivityEntry {
  type: 'link.saved' | 'link.archived';
  linkId: string;
  title: string;
  at: string;
}

export interface IActivityFeed {
  append(entry: ActivityEntry): Promise<void>;
  /** Newest first — the order the legacy promised. */
  newestFirst(): Promise<ActivityEntry[]>;
}
