import { ConcurrencyConflictException, IResult, Result } from '@Architecture/Domain';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { ILink } from '@Contexts/Links/Domain/Link/DTOs';
import { Link } from '@Contexts/Links/Domain/Link/Link';
import { ILinkRepository } from '@Contexts/Links/Domain/Link/Ports/ILinkRepository';

/** The legacy's Map, behind the port: a snapshot in, a snapshot out, and the version check the legacy did not have. */
export class InMemoryLinkRepository implements ILinkRepository {
  constructor(private dataSource: InMemoryDataSource<ILink>) {}

  async findById(id: string): Promise<Link | null> {
    const snapshot = this.dataSource.collection.get(id);
    return snapshot ? Link.fromSnapshot(snapshot) : null;
  }

  async save(link: Link): Promise<IResult> {
    const stored = this.dataSource.collection.get(link._id.value);
    if (stored && stored.version !== link.version) {
      return Result.fail(
        new ConcurrencyConflictException('Links', 'The link changed since it was read', {
          linkId: link._id.value,
          read: link.version,
          stored: stored.version,
        }),
      );
    }
    this.dataSource.collection.set(link._id.value, { ...link.toSnapshot(), version: link.version + 1 });
    return Result.ok();
  }
}
