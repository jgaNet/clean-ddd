import { FastifyReply, FastifyRequest } from 'fastify';
import { SendNotificationCommandEvent } from '@Contexts/Notifications/Application/Commands/SendNotification/SendNotificationCommandEvent';
import { MarkAsReadNotificationCommandEvent } from '@Contexts/Notifications/Application/Commands/MarkAsRead/MarkAsReadNotificationCommandEvent';
import { GetNotificationsQueryHandler } from '@Contexts/Notifications/Application/Queries/GetNotifications/GetNotificationsQueryHandler';
import { localNotificationsModule } from '@Contexts/Notifications/module.local';

export class FastifyNotificationController {
  constructor(private module: typeof localNotificationsModule) {}

  async getAccountNotifications(
    request: FastifyRequest<{
      Params: { recipientId: string };
      Querystring: {
        limit?: number;
        offset?: number;
        onlyUnread?: boolean;
      };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const recipientId = request.params.recipientId;
      const { limit, offset, onlyUnread } = request.query;

      const result = await this.module.getQuery(GetNotificationsQueryHandler).executeWithContext(
        {
          recipientId,
          limit: limit ? Number(limit) : undefined,
          offset: offset ? Number(offset) : undefined,
          onlyUnread,
        },
        request.executionContext,
      );

      if (result.isFailure()) {
        return reply.code(400).send({
          error: result.error?.message,
        });
      }

      return reply.code(200).send(result.data);
    } catch (error) {
      return reply.code(500).send({
        error: (error as Error).message,
      });
    }
  }

  async markAsRead(
    request: FastifyRequest<{
      Params: { id: string };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const notificationId = request.params.id;

      const command = MarkAsReadNotificationCommandEvent.set(notificationId);

      const operation = request.executionContext.eventBus.publish(command, request.executionContext);

      return reply.code(201).send({
        operationId: operation.id,
      });
    } catch (error) {
      return reply.code(500).send({
        error: (error as Error).message,
      });
    }
  }

  async sendNotification(
    request: FastifyRequest<{
      Body: {
        recipientId: string;
        type: string;
        title: string;
        content: string;
        metadata?: Record<string, unknown>;
      };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const command = SendNotificationCommandEvent.set({
        ...request.body,
        isManual: true, // Flag this as manual for the guard check
      });

      const operation = request.executionContext.eventBus.publish(command, request.executionContext);

      return reply.code(201).send({
        operationId: operation.id,
      });
    } catch (error) {
      return reply.code(500).send({
        error: (error as Error).message,
      });
    }
  }
}
