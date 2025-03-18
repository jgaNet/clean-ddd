import { FastifyInstance } from 'fastify';

import { FastifyOperationController } from '@Contexts/Tracker/Presentation/API/REST/Controllers/FastifyOperationController';
import { TrackerModule } from '@Contexts/Tracker/Application';
import {
  GetOperationsResSchema,
  GetOperationResSchema,
} from '@Contexts/Tracker/Presentation/API/REST/Routes/operation.routes.schema';

export const operationRoutes = function (
  fastify: FastifyInstance,
  { operationsModule }: { operationsModule: TrackerModule },
  done: () => void,
) {
  const operationController = new FastifyOperationController({
    queries: operationsModule.queries,
  });

  fastify.get(
    '/',
    {
      schema: {
        tags: ['tracker'],
        querystring: {
          type: 'object',
          properties: {
            traceId: { type: 'string' },
          },
        },
        response: GetOperationsResSchema,
      },
    },
    operationController.getOperations.bind(operationController),
  );

  fastify.get(
    '/:id',
    {
      schema: {
        tags: ['tracker'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: GetOperationResSchema,
      },
    },
    operationController.getOperation.bind(operationController),
  );

  done();
};
