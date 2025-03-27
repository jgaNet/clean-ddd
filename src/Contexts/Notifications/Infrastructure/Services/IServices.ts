import { IEventEmitter, IResult } from '@SharedKernel/Domain';
import { Notification } from '@Contexts/Notifications/Domain/Notification/Notification';
export interface IWebSocketService extends IEventEmitter {
  sendToUser(userId: string, notification: Notification): Promise<IResult<void>>;
  isUserConnected(userId: string): boolean;
}
