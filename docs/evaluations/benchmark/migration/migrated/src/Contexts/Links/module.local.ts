import { Module } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { ILink } from '@Contexts/Links/Domain/Link/DTOs';
import { LinkArchivedEvent, LinkSavedEvent } from '@Contexts/Links/Domain/Link/Events/LinkEvents';
import {
  ArchiveLinkCommandEvent,
  ArchiveLinkCommandHandler,
  SaveLinkCommandEvent,
  SaveLinkCommandHandler,
} from '@Contexts/Links/Application/Commands';
import {
  GetActivityQueryHandler,
  GetLinkQueryHandler,
  GetLinksQueryHandler,
} from '@Contexts/Links/Application/Queries';
import { LinkArchivedHandler } from '@Contexts/Links/Application/Events/LinkArchivedHandler';
import { LinkSavedHandler } from '@Contexts/Links/Application/Events/LinkSavedHandler';
import { ActivityEntry } from '@Contexts/Links/Application/Ports/IActivityFeed';
import { InMemoryActivityFeed } from '@Contexts/Links/Infrastructure/InMemoryActivityFeed';
import { InMemoryLinkQueries } from '@Contexts/Links/Infrastructure/Queries/InMemoryLinkQueries';
import { InMemoryLinkRepository } from '@Contexts/Links/Infrastructure/Repositories/InMemoryLinkRepository';

const linkDataSource = new InMemoryDataSource<ILink>();
const linkRepository = new InMemoryLinkRepository(linkDataSource);
const linkQueries = new InMemoryLinkQueries(linkDataSource);
const activityFeed = new InMemoryActivityFeed(new InMemoryDataSource<ActivityEntry>());

export const localLinksModule = new Module({
  name: 'Links',
  commands: [
    { event: SaveLinkCommandEvent, handlers: [new SaveLinkCommandHandler(linkRepository)] },
    { event: ArchiveLinkCommandEvent, handlers: [new ArchiveLinkCommandHandler(linkRepository)] },
  ],
  queries: [
    new GetLinksQueryHandler(linkQueries),
    new GetLinkQueryHandler(linkQueries),
    new GetActivityQueryHandler(activityFeed),
  ],
  // The legacy wrote the feed in the same request; here the facts are recorded by the link and told after the commit.
  domainEvents: [
    { event: LinkSavedEvent, handlers: [new LinkSavedHandler(activityFeed)] },
    { event: LinkArchivedEvent, handlers: [new LinkArchivedHandler(activityFeed)] },
  ],
});
