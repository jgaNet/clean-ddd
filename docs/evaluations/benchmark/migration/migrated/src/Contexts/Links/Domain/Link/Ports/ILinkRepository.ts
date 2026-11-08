import { IResult } from '@Architecture/Domain';

import { Link } from '@Contexts/Links/Domain/Link/Link';

/** The write side: a link by its id, and a link saved at version + 1 or refused on a conflict (ADR 8). */
export interface ILinkRepository {
  findById(id: string): Promise<Link | null>;
  save(link: Link): Promise<IResult>;
}
