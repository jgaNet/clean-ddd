import { IResult, Result, ValueObject } from '@SharedKernel/Domain';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { EmptyDeliveryStrategyException } from '@Contexts/Notifications/Domain/Notification/NotificationExceptions';

/**
 * The ordered list of channels to try until one accepts the notification: a value object,
 * so a strategy is always non-empty and free of duplicates, and two strategies with the same
 * channels are the same strategy.
 */
export class DeliveryStrategy extends ValueObject<Channel[]> {
  static create(channels: Channel[]): IResult<DeliveryStrategy> {
    const distinct = [...new Set(channels)];
    if (distinct.length === 0) {
      return Result.fail(new EmptyDeliveryStrategyException());
    }
    return Result.ok(new DeliveryStrategy(distinct));
  }

  get channels(): Channel[] {
    return [...this.value];
  }
}
