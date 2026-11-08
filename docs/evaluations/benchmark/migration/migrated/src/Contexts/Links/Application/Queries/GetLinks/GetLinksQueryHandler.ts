import { IResult, Result } from '@Architecture/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';

import { ILinkQueries, LinkView } from '@Contexts/Links/Domain/Link/Ports/ILinkQueries';

/** The links not archived, newest first; anyone may read them, as on the legacy. */
export class GetLinksQueryHandler extends QueryHandler<ILinkQueries, void, IResult<LinkView[]>> {
  async execute(_: void, __: ExecutionContext): Promise<IResult<LinkView[]>> {
    return Result.ok(await this.queries.findActive());
  }
}
