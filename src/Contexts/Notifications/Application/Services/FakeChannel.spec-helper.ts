import { IResult, Result } from '@SharedKernel/Domain';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { Delivery, INotificationChannel } from '@Contexts/Notifications/Domain/Notification/Ports/INotificationChannel';

/** A channel for tests: says whether it is available, accepts or refuses, and remembers what it received. */
export class FakeChannel implements INotificationChannel {
  delivered: Delivery[] = [];

  constructor(
    readonly channel: Channel,
    private available = true,
    private accepts = true,
  ) {}

  async isAvailableFor(): Promise<boolean> {
    return this.available;
  }

  async deliver(delivery: Delivery): Promise<IResult> {
    this.delivered.push(delivery);
    return this.accepts ? Result.ok() : Result.fail(new Error(`${this.channel} refused`));
  }
}
