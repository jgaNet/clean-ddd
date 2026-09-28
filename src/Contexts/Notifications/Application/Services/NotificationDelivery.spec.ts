import { expect, jest } from '@jest/globals';

import { EventBus, ExecutionContext } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { NotificationStatus } from '@Contexts/Notifications/Domain/Notification/NotificationStatus';
import {
  NotificationFailedEvent,
  NotificationSentEvent,
} from '@Contexts/Notifications/Domain/Notification/Events/NotificationEvents';
import { InMemoryNotificationRepository } from '@Contexts/Notifications/Infrastructure/Repositories/InMemoryNotificationRepository';
import { NotificationDelivery } from '@Contexts/Notifications/Application/Services/NotificationDelivery';
import { FakeChannel } from '@Contexts/Notifications/Application/Services/FakeChannel.spec-helper';

const eventBus = { connect: jest.fn(), publish: jest.fn(), subscribe: jest.fn() } as EventBus;
const context = () => new ExecutionContext({ traceId: 'trace', eventBus, auth: {} });

const toBob = { recipientId: 'bob', title: 'Hello', content: 'World', channels: [Channel.WEBSOCKET, Channel.EMAIL] };

let store: InMemoryDataSource<INotification>;
beforeEach(() => {
  jest.resetAllMocks();
  store = new InMemoryDataSource<INotification>();
});

const deliveryWith = (...channels: FakeChannel[]) =>
  new NotificationDelivery(new InMemoryNotificationRepository(store), channels);

describe('NotificationDelivery', () => {
  it('delivers through the first available channel and stops there', async () => {
    const websocket = new FakeChannel(Channel.WEBSOCKET);
    const email = new FakeChannel(Channel.EMAIL);

    const result = await deliveryWith(websocket, email).deliver(toBob, context());

    expect(result.isSuccess()).toBe(true);
    expect(websocket.delivered).toHaveLength(1);
    expect(email.delivered).toHaveLength(0);
    const saved = store.collection.get(result.data as string);
    expect(saved).toMatchObject({ status: NotificationStatus.SENT, deliveredVia: Channel.WEBSOCKET });
    expect(saved?.attempts.map(a => [a.channel, a.succeeded])).toEqual([[Channel.WEBSOCKET, true]]);
    expect(eventBus.publish).toHaveBeenCalledWith(
      NotificationSentEvent.set({ notificationId: result.data as string, recipientId: 'bob', via: Channel.WEBSOCKET }),
      expect.any(ExecutionContext),
    );
  });

  it('falls back to the next channel when the first is unavailable', async () => {
    const websocket = new FakeChannel(Channel.WEBSOCKET, false);
    const email = new FakeChannel(Channel.EMAIL);

    const result = await deliveryWith(websocket, email).deliver(toBob, context());

    expect(websocket.delivered).toHaveLength(0);
    expect(email.delivered).toHaveLength(1);
    const saved = store.collection.get(result.data as string);
    expect(saved).toMatchObject({ status: NotificationStatus.SENT, deliveredVia: Channel.EMAIL });
    expect(saved?.attempts.map(a => [a.channel, a.succeeded])).toEqual([
      [Channel.WEBSOCKET, false],
      [Channel.EMAIL, true],
    ]);
  });

  it('fails the notification, keeping every attempt, when no channel accepts it', async () => {
    const result = await deliveryWith(
      new FakeChannel(Channel.WEBSOCKET, true, false),
      new FakeChannel(Channel.EMAIL, true, false),
    ).deliver(toBob, context());

    expect(result.isSuccess()).toBe(true); // the delivery ran; the notification records the failure
    const saved = store.collection.get(result.data as string);
    expect(saved?.status).toBe(NotificationStatus.FAILED);
    expect(saved?.attempts).toHaveLength(2);
    expect(eventBus.publish).toHaveBeenCalledWith(
      NotificationFailedEvent.set({ notificationId: result.data as string, recipientId: 'bob' }),
      expect.any(ExecutionContext),
    );
  });

  it('treats a channel with no adapter as unavailable', async () => {
    const result = await deliveryWith(new FakeChannel(Channel.EMAIL)).deliver(toBob, context());

    expect(store.collection.get(result.data as string)).toMatchObject({ deliveredVia: Channel.EMAIL });
  });

  it('refuses an invalid notification before touching any channel', async () => {
    const websocket = new FakeChannel(Channel.WEBSOCKET);

    const result = await deliveryWith(websocket).deliver({ ...toBob, title: '  ' }, context());

    expect(result.isFailure()).toBe(true);
    expect(websocket.delivered).toHaveLength(0);
    expect(store.collection.size).toBe(0);
  });
});
