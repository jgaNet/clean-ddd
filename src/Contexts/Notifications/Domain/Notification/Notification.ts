import { Entity } from '@SharedKernel/Domain/DDD/Entity';
import { Result, IResult } from '@SharedKernel/Domain/Application/Result';
import { Id } from '@Contexts/@SharedKernel/Domain';
import { DeliveryStrategy } from './DeliveryStrategy';

export enum NotificationType {
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
  SMS = 'SMS',
  IN_APP = 'IN_APP',
  WEBSOCKET = 'WEBSOCKET',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  READ = 'READ',
}

export class Notification extends Entity {
  #recipientId: string;
  #type: NotificationType;
  #title: string;
  #content: string;
  #status: NotificationStatus;
  #createdAt: Date;
  #sentAt: Date | null = null;
  #readAt: Date | null = null;
  #metadata: Record<string, unknown> = {};
  #deliveryStrategy: DeliveryStrategy;
  #deliveryAttempts: Array<{ type: NotificationType; timestamp: Date; success: boolean }> = [];
  #successfulChannel?: NotificationType;

  private constructor(
    id: Id,
    recipientId: string,
    type: NotificationType,
    title: string,
    content: string,
    status: NotificationStatus,
    createdAt: Date,
    deliveryStrategy: DeliveryStrategy,
    metadata: Record<string, unknown> = {},
  ) {
    super(id);
    this.#recipientId = recipientId;
    this.#type = type;
    this.#title = title;
    this.#content = content;
    this.#status = status;
    this.#createdAt = createdAt;
    this.#metadata = metadata;
    this.#deliveryStrategy = deliveryStrategy;
  }

  static create(props: {
    id: string;
    recipientId: string;
    type: NotificationType;
    title: string;
    content: string;
    deliveryStrategy: DeliveryStrategy;
    metadata?: Record<string, unknown>;
  }): IResult<Notification> {
    if (!props.title?.trim()) {
      return Result.fail(new Error('Notification title is required'));
    }

    if (!props.content?.trim()) {
      return Result.fail(new Error('Notification content is required'));
    }

    if (!props.recipientId) {
      return Result.fail(new Error('Recipient ID is required'));
    }

    const notification = new Notification(
      new Id(props.id),
      props.recipientId,
      props.type,
      props.title,
      props.content,
      NotificationStatus.PENDING,
      new Date(),
      props.deliveryStrategy,
      props.metadata || {},
    );

    return Result.ok(notification);
  }

  markAsSent(channel: NotificationType): void {
    this.#status = NotificationStatus.SENT;
    this.#sentAt = new Date();
    this.#successfulChannel = channel;
  }

  markAsFailed(): void {
    this.#status = NotificationStatus.FAILED;
  }

  markAsRead(): void {
    if (this.#status === NotificationStatus.SENT) {
      this.#status = NotificationStatus.READ;
      this.#readAt = new Date();
    }
  }

  recordDeliveryAttempt(type: NotificationType, success: boolean): void {
    this.#deliveryAttempts.push({
      type,
      timestamp: new Date(),
      success,
    });
  }

  // Getters
  get recipientId(): string {
    return this.#recipientId;
  }
  get type(): NotificationType {
    return this.#type;
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
  get createdAt(): Date {
    return this.#createdAt;
  }
  get sentAt(): Date | null {
    return this.#sentAt;
  }
  get readAt(): Date | null {
    return this.#readAt;
  }
  get metadata(): Record<string, unknown> {
    return { ...this.#metadata };
  }
  get deliveryStrategy(): DeliveryStrategy {
    return this.#deliveryStrategy;
  }
  get deliveryAttempts(): Array<{ type: NotificationType; timestamp: Date; success: boolean }> {
    return [...this.#deliveryAttempts];
  }
  get successfulChannel(): NotificationType | undefined {
    return this.#successfulChannel;
  }
}
