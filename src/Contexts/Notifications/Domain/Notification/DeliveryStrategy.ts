import { NotificationType } from './Notification';

/**
 * DeliveryStrategy represents an ordered sequence of notification delivery channels.
 * The delivery system will attempt each channel in order until successful delivery.
 */
export class DeliveryStrategy {
  /**
   * Creates a websocket-only delivery strategy
   */
  static websocketOnly(): DeliveryStrategy {
    return new DeliveryStrategy([NotificationType.WEBSOCKET]);
  }

  /**
   * Creates an email-only delivery strategy
   */
  static emailOnly(): DeliveryStrategy {
    return new DeliveryStrategy([NotificationType.EMAIL]);
  }

  /**
   * Creates a strategy that tries websocket first, then falls back to email
   */
  static websocketThenEmail(): DeliveryStrategy {
    return new DeliveryStrategy([NotificationType.WEBSOCKET, NotificationType.EMAIL]);
  }

  /**
   * Creates a strategy that tries email first, then falls back to websocket
   */
  static emailThenWebsocket(): DeliveryStrategy {
    return new DeliveryStrategy([NotificationType.EMAIL, NotificationType.WEBSOCKET]);
  }

  /**
   * Creates a custom delivery strategy with specified channels
   */
  static custom(channels: NotificationType[]): DeliveryStrategy {
    if (!channels || channels.length === 0) {
      throw new Error('At least one delivery channel must be specified');
    }
    return new DeliveryStrategy(channels);
  }

  private constructor(private readonly channels: NotificationType[]) {
    if (!channels || channels.length === 0) {
      throw new Error('At least one delivery channel must be specified');
    }
  }

  /**
   * Gets all channels in this strategy
   */
  getChannels(): NotificationType[] {
    return [...this.channels];
  }

  /**
   * Gets the next channel to try after the specified one
   * @returns The next channel, or undefined if this was the last one
   */
  getNextChannel(current: NotificationType): NotificationType | undefined {
    const currentIndex = this.channels.indexOf(current);
    if (currentIndex === -1 || currentIndex === this.channels.length - 1) {
      return undefined;
    }
    return this.channels[currentIndex + 1];
  }

  /**
   * Gets the first channel to try in this strategy
   */
  getFirstChannel(): NotificationType {
    return this.channels[0];
  }

  /**
   * Checks if this strategy contains the specified channel
   */
  containsChannel(type: NotificationType): boolean {
    return this.channels.includes(type);
  }
}