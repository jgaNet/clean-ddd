import { FastifyInstance } from 'fastify';

import { FastifyOperationController } from '@Contexts/Tracker/Presentation/API/REST/Controllers/FastifyOperationController';
import { Module, OperationStatus } from '@SharedKernel/Application';
import {
  GetMyOperationsResSchema,
  GetOperationsResSchema,
  GetOperationResSchema,
} from '@Contexts/Tracker/Presentation/API/REST/Routes/operation.routes.schema';

export const operationRoutes = function (
  fastify: FastifyInstance,
  { operationsModule }: { operationsModule: Module },
  done: () => void,
) {
  const operationController = new FastifyOperationController({ module: operationsModule });

  fastify.get(
    '/',
    {
      schema: {
        tags: ['tracker'],
        querystring: {
          type: 'object',
          properties: {
            traceId: { type: 'string', format: 'uuid' },
          },
        },
        response: GetOperationsResSchema,
      },
    },
    operationController.getOperations.bind(operationController),
  );

  // A static segment, so it cannot collide with `/:id`.
  fastify.get(
    '/mine',
    {
      schema: {
        tags: ['tracker'],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: Object.values(OperationStatus) },
          },
        },
        response: GetMyOperationsResSchema,
      },
    },
    operationController.getMyOperations.bind(operationController),
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['tracker'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: GetOperationResSchema,
      },
    },
    operationController.getOperation.bind(operationController),
  );

  done();
};
