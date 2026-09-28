import { Entity } from '@SharedKernel/Domain';
import { Id } from '@SharedKernel/Domain/Utils';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { IDeliveryAttempt } from '@Contexts/Notifications/Domain/Notification/DTOs';

/**
 * DeliveryAttempt is an entity that is not an aggregate root: it has its own identity (two
 * attempts on the same channel are two different attempts), but it only exists inside a
 * Notification, is created and reached through it, records no events of its own, and is
 * persisted as part of the Notification's snapshot. Nothing outside the aggregate holds one.
 */
export class DeliveryAttempt extends Entity {
  #channel: Channel;
  #at: Date;
  #succeeded: boolean;

  private constructor(id: Id, channel: Channel, at: Date, succeeded: boolean) {
    super(id);
    this.#channel = channel;
    this.#at = at;
    this.#succeeded = succeeded;
  }

  static record(channel: Channel, succeeded: boolean, at: Date): DeliveryAttempt {
    return new DeliveryAttempt(Id.generate(), channel, at, succeeded);
  }

  static fromSnapshot(snapshot: IDeliveryAttempt): DeliveryAttempt {
    return new DeliveryAttempt(new Id(snapshot._id), snapshot.channel, snapshot.at, snapshot.succeeded);
  }

  toSnapshot(): IDeliveryAttempt {
    return { _id: this._id.value, channel: this.#channel, at: this.#at, succeeded: this.#succeeded };
  }

  get channel(): Channel {
    return this.#channel;
  }

  get at(): Date {
    return this.#at;
  }

  get succeeded(): boolean {
    return this.#succeeded;
  }
}
