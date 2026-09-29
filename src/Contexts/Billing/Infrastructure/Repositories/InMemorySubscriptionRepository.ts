import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Subscription } from '@Contexts/Billing/Domain/Subscription/Subscription';
import { ISubscription } from '@Contexts/Billing/Domain/Subscription/DTOs';
import { ISubscriptionRepository } from '@Contexts/Billing/Domain/Subscription/Ports/ISubscriptionRepository';

/** The repository port on the in-memory store: a snapshot in, a snapshot out. Same shape as InMemoryNoteRepository. */
export class InMemorySubscriptionRepository implements ISubscriptionRepository {
  constructor(private dataSource: InMemoryDataSource<ISubscription>) {}

  async findById(id: string): Promise<Subscription | null> {
    const snapshot = this.dataSource.collection.get(id);
    return snapshot ? Subscription.fromSnapshot(snapshot) : null;
  }

  async findByAccountId(accountId: string): Promise<Subscription | null> {
    const snapshot = [...this.dataSource.collection.values()].find(s => s.accountId === accountId);
    return snapshot ? Subscription.fromSnapshot(snapshot) : null;
  }

  async save(subscription: Subscription): Promise<void> {
    this.dataSource.collection.set(subscription._id.value, subscription.toSnapshot());
  }
}
