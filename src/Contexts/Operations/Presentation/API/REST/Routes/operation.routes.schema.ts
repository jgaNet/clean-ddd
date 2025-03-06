import { OperationStatus } from '@Primitives';
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
    context: {
      type: 'object',
      properties: {
        traceId: { type: 'string' },
        userId: { type: 'string' },
        metadata: { type: 'object', additionalProperties: true },
      },
    },
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
