import { Id } from '@SharedKernel/Domain/ValueObjects';

import { Notification } from '@Contexts/Notifications/Domain/Notification/Notification';
import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { DeliveryStrategy } from '@Contexts/Notifications/Domain/Notification/DeliveryStrategy';
import { NotificationStatus } from '@Contexts/Notifications/Domain/Notification/NotificationStatus';
import {
  NotificationFailedEvent,
  NotificationReadEvent,
  NotificationSentEvent,
} from '@Contexts/Notifications/Domain/Notification/Events/NotificationEvents';
import {
  BlankNotificationTitleException,
  ChannelAlreadyTriedException,
  EmptyDeliveryStrategyException,
  NotNotificationRecipientException,
  NotificationAlreadyReadException,
  NotificationNotDeliveredException,
} from '@Contexts/Notifications/Domain/Notification/NotificationExceptions';

const bob = new Id('bob');
const carol = new Id('carol');
const at = new Date('2026-01-01T10:00:00Z');

function aNotification(channels = [Channel.WEBSOCKET, Channel.EMAIL]): Notification {
  const result = Notification.create({ recipientId: 'bob', title: 'Hello', content: 'World', channels }, at);
  if (result.isFailure()) throw result.error;
  return result.data;
}

describe('Notification', () => {
  describe('creating', () => {
    it('starts pending with every channel of the strategy still to try', () => {
      const notification = aNotification();

      expect(notification.status).toBe(NotificationStatus.PENDING);
      expect(notification.channelsToTry()).toEqual([Channel.WEBSOCKET, Channel.EMAIL]);
      expect(notification.attempts).toEqual([]);
      expect(notification.pullDomainEvents()).toEqual([]);
    });

    it('refuses a blank title and an empty strategy', () => {
      expect(
        Notification.create({ recipientId: 'bob', title: ' ', content: 'x', channels: [Channel.EMAIL] }).error,
      ).toBeInstanceOf(BlankNotificationTitleException);
      expect(Notification.create({ recipientId: 'bob', title: 'x', content: 'x', channels: [] }).error).toBeInstanceOf(
        EmptyDeliveryStrategyException,
      );
    });
  });

  describe('delivery attempts (child entities)', () => {
    it('is sent by the first channel that accepts it, and records NotificationSent', () => {
      const notification = aNotification();

      expect(notification.recordAttempt(Channel.WEBSOCKET, true, at).isSuccess()).toBe(true);

      expect(notification.status).toBe(NotificationStatus.SENT);
      expect(notification.deliveredVia).toBe(Channel.WEBSOCKET);
      expect(notification.channelsToTry()).toEqual([]);
      expect(notification.attempts.map(a => [a.channel, a.succeeded])).toEqual([[Channel.WEBSOCKET, true]]);
      expect(notification.pullDomainEvents()).toEqual([
        NotificationSentEvent.set({
          notificationId: notification._id.value,
          recipientId: 'bob',
          via: Channel.WEBSOCKET,
        }),
      ]);
    });

    it('falls back to the next channel after a failure', () => {
      const notification = aNotification();

      notification.recordAttempt(Channel.WEBSOCKET, false, at);
      expect(notification.status).toBe(NotificationStatus.PENDING);
      expect(notification.channelsToTry()).toEqual([Channel.EMAIL]);

      notification.recordAttempt(Channel.EMAIL, true, at);
      expect(notification.status).toBe(NotificationStatus.SENT);
      expect(notification.deliveredVia).toBe(Channel.EMAIL);
      expect(notification.attempts).toHaveLength(2);
    });

    it('fails once every channel was tried, and records NotificationFailed', () => {
      const notification = aNotification();

      notification.recordAttempt(Channel.WEBSOCKET, false, at);
      notification.recordAttempt(Channel.EMAIL, false, at);

      expect(notification.status).toBe(NotificationStatus.FAILED);
      expect(notification.pullDomainEvents()).toEqual([
        NotificationFailedEvent.set({ notificationId: notification._id.value, recipientId: 'bob' }),
      ]);
    });

    it('never tries the same channel twice', () => {
      const notification = aNotification();
      notification.recordAttempt(Channel.WEBSOCKET, false, at);

      expect(notification.recordAttempt(Channel.WEBSOCKET, true, at).error).toBeInstanceOf(
        ChannelAlreadyTriedException,
      );
    });

    it('gives each attempt its own identity', () => {
      const notification = aNotification();
      notification.recordAttempt(Channel.WEBSOCKET, false, at);
      notification.recordAttempt(Channel.EMAIL, false, at);

      const [first, second] = notification.attempts;
      expect(first.equals(second)).toBe(false);
    });
  });

  describe('reading', () => {
    it('is marked read by its recipient once delivered, and records NotificationRead', () => {
      const notification = aNotification();
      notification.recordAttempt(Channel.WEBSOCKET, true, at);
      notification.pullDomainEvents();

      expect(notification.markRead(bob, at).isSuccess()).toBe(true);
      expect(notification.status).toBe(NotificationStatus.READ);
      expect(notification.pullDomainEvents()).toEqual([
        NotificationReadEvent.set({ notificationId: notification._id.value, recipientId: 'bob' }),
      ]);
    });

    it('is reserved to the recipient', () => {
      const notification = aNotification();
      notification.recordAttempt(Channel.WEBSOCKET, true, at);

      expect(notification.markRead(carol).error).toBeInstanceOf(NotNotificationRecipientException);
    });

    it('cannot be read before delivery, nor twice', () => {
      const pending = aNotification();
      expect(pending.markRead(bob).error).toBeInstanceOf(NotificationNotDeliveredException);

      const read = aNotification();
      read.recordAttempt(Channel.WEBSOCKET, true, at);
      read.markRead(bob);
      expect(read.markRead(bob).error).toBeInstanceOf(NotificationAlreadyReadException);
    });
  });

  describe('persistence round-trip', () => {
    it('rebuilds the notification and its attempts from a snapshot, without events', () => {
      const notification = aNotification();
      notification.recordAttempt(Channel.WEBSOCKET, false, at);
      notification.recordAttempt(Channel.EMAIL, true, at);
      notification.markRead(bob, at);

      const rebuilt = Notification.fromSnapshot(notification.toSnapshot());

      expect(rebuilt.equals(notification)).toBe(true);
      expect(rebuilt.toSnapshot()).toEqual(notification.toSnapshot());
      expect(rebuilt.attempts.map(a => a._id.value)).toEqual(notification.attempts.map(a => a._id.value));
      expect(rebuilt.pullDomainEvents()).toEqual([]);
    });
  });
});

describe('DeliveryStrategy', () => {
  it('drops duplicate channels and keeps the order', () => {
    expect(DeliveryStrategy.create([Channel.EMAIL, Channel.WEBSOCKET, Channel.EMAIL]).data?.channels).toEqual([
      Channel.EMAIL,
      Channel.WEBSOCKET,
    ]);
  });

  it('compares by value', () => {
    expect(
      DeliveryStrategy.create([Channel.WEBSOCKET, Channel.EMAIL]).data!.equals(
        DeliveryStrategy.create([Channel.WEBSOCKET, Channel.EMAIL]).data!,
      ),
    ).toBe(true);
  });
});
