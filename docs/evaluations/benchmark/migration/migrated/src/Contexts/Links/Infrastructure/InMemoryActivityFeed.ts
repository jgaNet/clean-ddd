import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';

import { ActivityEntry, IActivityFeed } from '@Contexts/Links/Application/Ports/IActivityFeed';

/** The feed in memory: appended in order, read in reverse. The store takes part in the unit of work's rollback like any other. */
export class InMemoryActivityFeed implements IActivityFeed {
  constructor(private dataSource: InMemoryDataSource<ActivityEntry>) {}

  async append(entry: ActivityEntry): Promise<void> {
    this.dataSource.collection.set(String(this.dataSource.collection.size + 1).padStart(12, '0'), entry);
  }

  async newestFirst(): Promise<ActivityEntry[]> {
    return [...this.dataSource.collection.values()].reverse();
  }
}
