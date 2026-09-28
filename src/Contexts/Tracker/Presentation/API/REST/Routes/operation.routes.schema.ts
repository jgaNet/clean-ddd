import { OperationStatus } from '@SharedKernel/Application';

const OperationRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    status: { type: 'string', enum: Object.values(OperationStatus) },
    traceId: { type: 'string', format: 'uuid' },
    subjectId: { type: 'string' },
    payload: { description: 'The command or event payload, as published' },
    result: { description: 'What the handler returned, on success' },
    error: {
      type: 'object',
      properties: { type: { type: 'string' }, message: { type: 'string' } },
    },
    createdAt: { type: 'string', format: 'date-time' },
    finishedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const ErrorSchema = {
  type: 'object',
  properties: { message: { type: 'string' } },
} as const;

export const GetOperationsResSchema = {
  200: { description: 'Success', type: 'array', items: OperationRecordSchema },
  400: ErrorSchema,
} as const;

export const GetOperationResSchema = {
  200: { description: 'Success', ...OperationRecordSchema },
  404: ErrorSchema,
} as const;
