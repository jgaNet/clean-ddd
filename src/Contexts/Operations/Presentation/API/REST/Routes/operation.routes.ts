import { FastifyInstance } from 'fastify';

import { FastifyOperationController } from '@Contexts/Operations/Presentation/API/REST/Controllers/FastifyOperationController';
import { OperationsModule } from '@Contexts/Operations/Application';
import {
  GetOperationsResSchema,
  GetOperationResSchema,
} from '@Contexts/Operations/Presentation/API/REST/Routes/operation.routes.schema';

export const operationRoutes = function (
  fastify: FastifyInstance,
  { operationsModule }: { operationsModule: OperationsModule },
  done: () => void,
) {
  const operationController = new FastifyOperationController({
    queries: operationsModule.queries,
  });

  fastify.get(
    '/',
    {
      schema: {
        response: GetOperationsResSchema,
      },
    },
    operationController.getOperations.bind(operationController),
  );

  fastify.get(
    '/:id',
    {
      schema: {
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
