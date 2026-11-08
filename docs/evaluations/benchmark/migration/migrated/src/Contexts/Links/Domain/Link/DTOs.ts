import { LinkStatus } from '@Contexts/Links/Domain/Link/LinkStatus';

/** The snapshot of a link: what is persisted and rebuilt, nothing else crosses to the infrastructure. */
export interface ILink {
  _id: string;
  url: string;
  title: string;
  status: LinkStatus;
  /** ISO 8601: the legacy answered it as such, and a snapshot is plain data. */
  createdAt: string;
  version: number;
}

/** What is needed to save a brand new link. */
export type INewLink = Pick<ILink, 'url' | 'title'>;
