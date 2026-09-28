import { FastifyReply, FastifyRequest } from 'fastify';

import { Exception, NotAllowedException } from '@SharedKernel/Domain';
import { Module } from '@SharedKernel/Application';

import { Channel } from '@Contexts/Notifications/Domain/Notification/Channel';
import { NotificationNotFoundException } from '@Contexts/Notifications/Domain/Notification/NotificationExceptions';
import { SendNotificationCommandEvent } from '@Contexts/Notifications/Application/Commands/SendNotification/SendNotificationCommandEvent';
import { MarkAsReadNotificationCommandEvent } from '@Contexts/Notifications/Application/Commands/MarkAsRead/MarkAsReadNotificationCommandEvent';
import { GetNotificationsQueryHandler } from '@Contexts/Notifications/Application/Queries/GetNotifications/GetNotificationsQueryHandler';

export class FastifyNotificationController {
  constructor(private module: Module) {}

  async getAccountNotifications(
    req: FastifyRequest<{
      Params: { recipientId: string };
      Querystring: { limit?: number; offset?: number; onlyUnread?: boolean };
    }>,
    reply: FastifyReply,
  ) {
    const result = await this.module
      .getQuery(GetNotificationsQueryHandler)
      .handle({ recipientId: req.params.recipientId, ...req.query }, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  async markAsRead(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const context = req.executionContext;
    const operation = context.eventBus.publish(
      MarkAsReadNotificationCommandEvent.set({ notificationId: req.params.id }),
      context,
    );

    reply.code(202);
    return { operationId: operation.id };
  }

  async sendNotification(
    req: FastifyRequest<{
      Body: {
        recipientId: string;
        title: string;
        content: string;
        channels: Channel[];
        metadata?: Record<string, unknown>;
      };
    }>,
    reply: FastifyReply,
  ) {
    const context = req.executionContext;
    const operation = context.eventBus.publish(SendNotificationCommandEvent.set(req.body), context);

    reply.code(202);
    return { operationId: operation.id };
  }

  private refuse(reply: FastifyReply, error: Exception) {
    if (error instanceof NotAllowedException) reply.code(403);
    else if (error instanceof NotificationNotFoundException) reply.code(404);
    else reply.code(400);

    return { message: error.message };
  }
}
