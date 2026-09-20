import { FastifyInstance } from 'fastify';
import { IResult } from '@Core/Application';
import { IEventEmitter } from '@Core/Domain/Services';
import { Notification } from '@Contexts/Notifications/Domain/Notification/Notification';
export interface IWebSocketService extends IEventEmitter {
  initialize(fastify: FastifyInstance): Promise<void>;
  sendToUser(userId: string, notification: Notification): Promise<IResult<void>>;
  isUserConnected(userId: string): boolean;
}
