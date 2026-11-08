import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { ILink } from '@Contexts/Links/Domain/Link/DTOs';
import { LinkStatus } from '@Contexts/Links/Domain/Link/LinkStatus';
import { ILinkQueries, LinkView } from '@Contexts/Links/Domain/Link/Ports/ILinkQueries';

/** The read side on the same store: the view the legacy answered, newest first by insertion as the legacy listed. */
export class InMemoryLinkQueries implements ILinkQueries {
  constructor(private dataSource: InMemoryDataSource<ILink>) {}

  async findById(linkId: string): Promise<LinkView | null> {
    const link = this.dataSource.collection.get(linkId);
    return link ? view(link) : null;
  }

  async findActive(): Promise<LinkView[]> {
    return [...this.dataSource.collection.values()]
      .filter(link => link.status === LinkStatus.ACTIVE)
      .reverse()
      .map(view);
  }
}

const view = (link: ILink): LinkView => ({
  id: link._id,
  url: link.url,
  title: link.title,
  archived: link.status === LinkStatus.ARCHIVED,
  createdAt: link.createdAt,
});
