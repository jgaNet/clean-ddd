import { IResult } from '@SharedKernel/Domain';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';

/** What a channel receives: enough to deliver, nothing about how the aggregate is built. */
export interface Delivery {
  notificationId: string;
  recipientId: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

/**
 * One implementation per Channel value, in the infrastructure (websocket, email...).
 * The port knows nothing about logging or transport: an adapter that needs a logger takes
 * it in its constructor.
 */
export interface INotificationChannel {
  readonly channel: Channel;
  isAvailableFor(recipientId: string): Promise<boolean>;
  deliver(delivery: Delivery): Promise<IResult>;
}
