import { FastifyInstance } from 'fastify';

import { FastifyOperationController } from '@Shared/Presentation/API/REST/Controllers/FastifyOperationController';
import { SharedModule } from '@Shared/Application';
import { OperationStatus } from '@Shared/Domain/Operation';

const OperationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: Object.values(OperationStatus) },
    createdAt: { type: 'string' },
    finishedAt: { type: 'string' },
    event: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        payload: { type: 'object', additionalProperties: true },
      },
    },
    result: { type: 'object', additionalProperties: true },
  },
} as const;

export const GetOperationsResSchema = {
  200: {
    description: 'Success',
    type: 'array',
    items: OperationSchema,
  },
  400: {
    description: 'Bad request',
    type: 'object',
    properties: { message: { type: 'string' } },
  },
} as const;

export const GetOperationResSchema = {
  200: {
    description: 'Success',
    ...OperationSchema,
  },
  404: {
    description: 'Not found',
    type: 'object',
    properties: { message: { type: 'string' } },
  },
} as const;

export const operationRoutes = function (
  fastify: FastifyInstance,
  { sharedModule }: { sharedModule: SharedModule },
  done: () => void,
) {
  const operationController = new FastifyOperationController({
    queries: sharedModule.queries,
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
