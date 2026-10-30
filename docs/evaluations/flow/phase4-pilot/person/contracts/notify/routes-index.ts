import { FastifyInstance } from 'fastify';

import { Module } from '@Architecture/Application';

/**
 * The routes of Notifications, served under `/notifications`. Registered in the composition root
 * when the context was declared; its first feature writes them.
 */
export const notificationRoutes = function (
  _fastify: FastifyInstance,
  _options: { notificationsModule: Module },
  done: () => void,
) {
  done();
};
