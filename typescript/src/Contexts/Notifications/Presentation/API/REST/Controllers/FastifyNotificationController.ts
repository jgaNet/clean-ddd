import { FastifyReply, FastifyRequest } from 'fastify';

import { Exception, NotAllowedException } from '@Architecture/Domain';
import { ExecutionContext, Module } from '@Architecture/Application';
import { acceptCommand, notAllowedStatus } from '@Architecture/Presentation/AcceptCommand';

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

    return result.isFailure() ? this.refuse(reply, result.error, req.executionContext) : result.data;
  }

  async markAsRead(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    return acceptCommand(
      req,
      reply,
      this.module,
      MarkAsReadNotificationCommandEvent.set({ notificationId: req.params.id }),
    );
  }

  async sendNotification(
    req: FastifyRequest<{
      Body: {
        recipientId: string;
        title: string;
        content: string;
        channels: string[];
        metadata?: Record<string, unknown>;
      };
    }>,
    reply: FastifyReply,
  ) {
    return acceptCommand(req, reply, this.module, SendNotificationCommandEvent.set(req.body));
  }

  private refuse(reply: FastifyReply, error: Exception, context: ExecutionContext) {
    if (error instanceof NotAllowedException) reply.code(notAllowedStatus(context));
    else if (error instanceof NotificationNotFoundException) reply.code(404);
    else reply.code(400);

    return { message: error.message };
  }
}
