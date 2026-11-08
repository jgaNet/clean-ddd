import { IResult, Result } from '@Architecture/Domain';
import { EventHandler, ExecutionContext } from '@Architecture/Application';

import { LinkArchivedEvent } from '@Contexts/Links/Domain/Link/Events/LinkEvents';
import { IActivityFeed } from '@Contexts/Links/Application/Ports/IActivityFeed';

/** An archived link is told in the activity feed, as the legacy did in the same request. */
export class LinkArchivedHandler extends EventHandler<LinkArchivedEvent> {
  constructor(private feed: IActivityFeed) {
    super();
  }

  async execute({ payload }: LinkArchivedEvent, _: ExecutionContext): Promise<IResult> {
    await this.feed.append({ type: 'link.archived', linkId: payload.linkId, title: payload.title, at: payload.at });
    return Result.ok();
  }
}
