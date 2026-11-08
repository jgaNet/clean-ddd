import { IResult, Result } from '@Architecture/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';

import { ActivityEntry, IActivityFeed } from '@Contexts/Links/Application/Ports/IActivityFeed';

/** What happened, newest first. */
export class GetActivityQueryHandler extends QueryHandler<IActivityFeed, void, IResult<ActivityEntry[]>> {
  async execute(_: void, __: ExecutionContext): Promise<IResult<ActivityEntry[]>> {
    return Result.ok(await this.queries.newestFirst());
  }
}
