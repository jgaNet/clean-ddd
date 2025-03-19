import { FromSchema } from 'json-schema-to-ts';

export const CreateNoteReqBodySchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['title', 'content'],
} as const;

export const CreateNoteResSchema = {
  400: {
    description: 'Input Error',
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
    required: ['title'],
  },
  202: {
    description: 'Accepted',
    type: 'object',
    properties: {
      operationId: { type: 'string' },
    },
  },
} as const;

export const GetNotesResSchema = {
  200: {
    description: 'Success',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        _id: { type: 'string' },
        ownerId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
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

export type CreateNoteReqBody = FromSchema<typeof CreateNoteReqBodySchema>;
