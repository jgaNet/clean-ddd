import { IResult, Result } from '@Architecture/Domain';
import { EventHandler, ExecutionContext } from '@Architecture/Application';

import { LinkSavedEvent } from '@Contexts/Links/Domain/Link/Events/LinkEvents';
import { IActivityFeed } from '@Contexts/Links/Application/Ports/IActivityFeed';

/** The policy the legacy had inline: a saved link is told in the activity feed. */
export class LinkSavedHandler extends EventHandler<LinkSavedEvent> {
  constructor(private feed: IActivityFeed) {
    super();
  }

  async execute({ payload }: LinkSavedEvent, _: ExecutionContext): Promise<IResult> {
    await this.feed.append({ type: 'link.saved', linkId: payload.linkId, title: payload.title, at: payload.at });
    return Result.ok();
  }
}
