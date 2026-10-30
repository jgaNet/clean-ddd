import { IResult, Result, ValueObject } from '@Architecture/Domain';

import { Channel, isChannel } from '@Contexts/Notifications/Domain/Notification/Channel';
import {
  EmptyDeliveryStrategyException,
  UnknownChannelException,
} from '@Contexts/Notifications/Domain/Notification/NotificationExceptions';

/**
 * The ordered list of channels to try until one accepts the notification: a value object,
 * so a strategy is always non-empty, made of channels the domain knows and free of duplicates,
 * and two strategies with the same channels are the same strategy. It takes names as a client
 * sends them: whether a name is a channel is this rule's to say, not the request schema's.
 */
export class DeliveryStrategy extends ValueObject<Channel[]> {
  static create(names: readonly string[]): IResult<DeliveryStrategy> {
    const unknown = names.find(name => !isChannel(name));
    if (unknown !== undefined) {
      return Result.fail(new UnknownChannelException(unknown));
    }
    const distinct = [...new Set(names.filter(isChannel))];
    if (distinct.length === 0) {
      return Result.fail(new EmptyDeliveryStrategyException());
    }
    return Result.ok(new DeliveryStrategy(distinct));
  }

  /** Same channels in the same order: the order is the strategy. */
  protected equalsValue(a: Channel[], b: Channel[]): boolean {
    return a.length === b.length && a.every((channel, i) => channel === b[i]);
  }

  get channels(): Channel[] {
    return [...this.value];
  }
}
