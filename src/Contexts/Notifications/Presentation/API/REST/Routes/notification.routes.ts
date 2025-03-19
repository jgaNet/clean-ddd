import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { FastifyNotificationController } from '../Controllers/FastifyNotificationController';
import { notificationSchema } from './notification.routes.schema';

import { localNotificationsModule } from '@Contexts/Notifications/module.local';

export default function notificationRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions & { notificationsModule: typeof localNotificationsModule },
  done: (err?: Error) => void,
): void {
  const controller = new FastifyNotificationController(options.notificationsModule);

  // Get notifications for an account
  fastify.get(
    '/account/:recipientId',
    { schema: notificationSchema.getAccountNotifications },
    controller.getAccountNotifications.bind(controller),
  );

  // Mark notification as read
  fastify.patch('/:id/read', { schema: notificationSchema.markAsRead }, controller.markAsRead.bind(controller));

  // Send manual notification (authorization handled in guard)
  fastify.post('/', { schema: notificationSchema.sendNotification }, controller.sendNotification.bind(controller));

  done();
}
