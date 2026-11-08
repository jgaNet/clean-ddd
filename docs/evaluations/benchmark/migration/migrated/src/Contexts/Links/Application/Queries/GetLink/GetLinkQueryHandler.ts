import { IResult, Result } from '@Architecture/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';

import { ILinkQueries, LinkView } from '@Contexts/Links/Domain/Link/Ports/ILinkQueries';
import { LinkNotFoundException } from '@Contexts/Links/Domain/Link/LinkExceptions';

export class GetLinkQueryHandler extends QueryHandler<ILinkQueries, string, IResult<LinkView>> {
  async execute(linkId: string, _: ExecutionContext): Promise<IResult<LinkView>> {
    const link = await this.queries.findById(linkId);
    if (!link) return Result.fail(new LinkNotFoundException(linkId));
    return Result.ok(link);
  }
}
