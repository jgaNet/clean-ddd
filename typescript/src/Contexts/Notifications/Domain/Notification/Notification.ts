import { AggregateRoot, IResult, Result } from '@Architecture/Domain';
import { Id } from '@Architecture/Domain';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { DeliveryAttempt } from '@Contexts/Notifications/Domain/Notification/DeliveryAttempt';
import { DeliveryStrategy } from '@Contexts/Notifications/Domain/Notification/DeliveryStrategy';
import { INewNotification, INotification } from '@Contexts/Notifications/Domain/Notification/DTOs';
import { NotificationStatus } from '@Contexts/Notifications/Domain/Notification/NotificationStatus';
import {
  NotificationFailedEvent,
  NotificationReadEvent,
  NotificationSentEvent,
} from '@Contexts/Notifications/Domain/Notification/Events/NotificationEvents';
import {
  BlankNotificationContentException,
  BlankNotificationTitleException,
  ChannelAlreadyTriedException,
  NotNotificationRecipientException,
  NotificationAlreadyReadException,
  NotificationNotDeliveredException,
} from '@Contexts/Notifications/Domain/Notification/NotificationExceptions';

/**
 * Notification is the aggregate root of the Notifications context: something to tell one
 * account, and the story of how it was delivered.
 *
 * - it always has a title, a content and a non-empty delivery strategy
 * - each channel is tried at most once; the attempts are child entities (DeliveryAttempt)
 * - the first channel that accepts it makes it SENT; when none is left it is FAILED
 * - only its recipient can mark it read, and only once it was delivered
 *
 * Talking to a channel is not the aggregate's job (see INotificationChannel and the
 * NotificationDelivery application service); recording what happened is.
 */
export class Notification extends AggregateRoot {
  #recipientId: Id;
  #title: string;
  #content: string;
  #strategy: DeliveryStrategy;
  #status: NotificationStatus;
  #createdAt: Date;
  #sentAt?: Date;
  #readAt?: Date;
  #deliveredVia?: Channel;
  #metadata: Record<string, unknown>;
  #attempts: DeliveryAttempt[];

  private constructor(
    id: Id,
    recipientId: Id,
    title: string,
    content: string,
    strategy: DeliveryStrategy,
    status: NotificationStatus,
    createdAt: Date,
    metadata: Record<string, unknown>,
    attempts: DeliveryAttempt[],
    sentAt?: Date,
    readAt?: Date,
    deliveredVia?: Channel,
  ) {
    super(id);
    this.#recipientId = recipientId;
    this.#title = title;
    this.#content = content;
    this.#strategy = strategy;
    this.#status = status;
    this.#createdAt = createdAt;
    this.#metadata = metadata;
    this.#attempts = attempts;
    this.#sentAt = sentAt;
    this.#readAt = readAt;
    this.#deliveredVia = deliveredVia;
  }

  static create(props: INewNotification, now: Date = new Date()): IResult<Notification> {
    const title = props.title.trim();
    if (!title) return Result.fail(new BlankNotificationTitleException());

    const content = props.content.trim();
    if (!content) return Result.fail(new BlankNotificationContentException());

    const strategy = DeliveryStrategy.create(props.channels);
    if (strategy.isFailure()) return strategy;

    return Result.ok(
      new Notification(
        Id.generate(),
        new Id(props.recipientId),
        title,
        content,
        strategy.data,
        NotificationStatus.PENDING,
        now,
        props.metadata ?? {},
        [],
      ),
    );
  }

  static fromSnapshot(snapshot: INotification): Notification {
    const strategy = DeliveryStrategy.create(snapshot.channels);
    if (strategy.isFailure() || !snapshot.title.trim() || !snapshot.content.trim()) {
      throw new Error(`Corrupted notification ${snapshot._id}`);
    }

    return new Notification(
      new Id(snapshot._id),
      new Id(snapshot.recipientId),
      snapshot.title,
      snapshot.content,
      strategy.data,
      snapshot.status,
      snapshot.createdAt,
      snapshot.metadata,
      snapshot.attempts.map(DeliveryAttempt.fromSnapshot),
      snapshot.sentAt,
      snapshot.readAt,
      snapshot.deliveredVia,
    );
  }

  /** The channels of the strategy not tried yet, in order. Empty once delivered or exhausted. */
  channelsToTry(): Channel[] {
    if (this.#status !== NotificationStatus.PENDING) return [];
    const tried = new Set(this.#attempts.map(attempt => attempt.channel));
    return this.#strategy.channels.filter(channel => !tried.has(channel));
  }

  /** Records what a channel answered. A success delivers the notification; the last failure fails it. */
  recordAttempt(channel: Channel, succeeded: boolean, at: Date = new Date()): IResult {
    if (this.#attempts.some(attempt => attempt.channel === channel)) {
      return Result.fail(new ChannelAlreadyTriedException(this._id.value, channel));
    }

    this.#attempts.push(DeliveryAttempt.create(channel, succeeded, at));

    if (succeeded) {
      this.#status = NotificationStatus.SENT;
      this.#sentAt = at;
      this.#deliveredVia = channel;
      this.record(
        NotificationSentEvent.set({
          notificationId: this._id.value,
          recipientId: this.#recipientId.value,
          via: channel,
        }),
      );
    } else if (this.channelsToTry().length === 0) {
      this.#status = NotificationStatus.FAILED;
      this.record(
        NotificationFailedEvent.set({ notificationId: this._id.value, recipientId: this.#recipientId.value }),
      );
    }

    return Result.ok();
  }

  markRead(actorId: Id, at: Date = new Date()): IResult {
    if (!this.#recipientId.equals(actorId)) {
      return Result.fail(new NotNotificationRecipientException(this._id.value, actorId.value));
    }
    if (this.#status === NotificationStatus.READ) {
      return Result.fail(new NotificationAlreadyReadException(this._id.value));
    }
    if (this.#status !== NotificationStatus.SENT) {
      return Result.fail(new NotificationNotDeliveredException(this._id.value));
    }

    this.#status = NotificationStatus.READ;
    this.#readAt = at;
    this.record(NotificationReadEvent.set({ notificationId: this._id.value, recipientId: this.#recipientId.value }));

    return Result.ok();
  }

  toSnapshot(): INotification {
    return {
      _id: this._id.value,
      recipientId: this.#recipientId.value,
      title: this.#title,
      content: this.#content,
      channels: this.#strategy.channels,
      status: this.#status,
      createdAt: this.#createdAt,
      sentAt: this.#sentAt,
      readAt: this.#readAt,
      deliveredVia: this.#deliveredVia,
      metadata: { ...this.#metadata },
      attempts: this.#attempts.map(attempt => attempt.toSnapshot()),
    };
  }

  get recipientId(): Id {
    return this.#recipientId;
  }

  get title(): string {
    return this.#title;
  }

  get content(): string {
    return this.#content;
  }

  get status(): NotificationStatus {
    return this.#status;
  }

  get deliveredVia(): Channel | undefined {
    return this.#deliveredVia;
  }

  get metadata(): Record<string, unknown> {
    return { ...this.#metadata };
  }

  get attempts(): readonly DeliveryAttempt[] {
    return [...this.#attempts];
  }
}
