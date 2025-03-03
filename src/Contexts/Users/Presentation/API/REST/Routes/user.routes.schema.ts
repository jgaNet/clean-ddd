import { OperationStatus } from '@Primitives';
import { FromSchema } from 'json-schema-to-ts';

export const CreateUserReqBodySchema = {
  type: 'object',
  properties: {
    email: { type: 'string' },
    nickname: { type: 'string' },
  },
  required: ['email'],
} as const;

export const CreateUserResSchema = {
  400: {
    description: 'Input Error',
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
  },
  202: {
    description: 'Accepted',
    type: 'object',
    properties: {
      currentOperation: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: Object.values(OperationStatus) },
          createdAt: { type: 'string' },
          finishedAt: { type: 'string' },
        },
      },
    },
  },
} as const;

export const GetUsersResSchema = {
  200: {
    description: 'Success',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        _id: { type: 'string' },
        profile: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            nickname: { type: 'string' },
          },
          required: ['email', 'nickname'],
        },
      },
    },
  },
  400: {
    description: 'Error',
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
  },
} as const;

export type CreateUserReqBody = FromSchema<typeof CreateUserReqBodySchema>;
