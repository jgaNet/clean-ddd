import { FromSchema } from 'json-schema-to-ts';

const AcceptedResSchema = {
  description: 'Accepted: the command is being processed, poll the operation to know its outcome',
  type: 'object',
  properties: {
    operationId: { type: 'string', format: 'uuid' },
  },
} as const;

const ErrorResSchema = {
  type: 'object',
  properties: {
    message: { type: 'string' },
  },
} as const;

const NoteIdParamsSchema = {
  type: 'object',
  properties: { id: { type: 'string' } },
  required: ['id'],
} as const;

export const CreateNoteReqBodySchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    content: { type: 'string' },
  },
  required: ['title', 'content'],
} as const;

export const EditNoteReqBodySchema = CreateNoteReqBodySchema;

export const ShareNoteReqBodySchema = {
  type: 'object',
  properties: {
    recipientId: { type: 'string' },
  },
  required: ['recipientId'],
} as const;

export const CommandResSchema = {
  202: AcceptedResSchema,
  400: ErrorResSchema,
  403: ErrorResSchema,
} as const;

export const CommandOnNoteSchema = {
  params: NoteIdParamsSchema,
  response: CommandResSchema,
} as const;

const NoteListItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] },
    pinned: { type: 'boolean' },
  },
} as const;

export const GetMyNotesResSchema = {
  200: { description: 'Success, pinned notes first', type: 'array', items: NoteListItemSchema },
  403: ErrorResSchema,
} as const;

export const GetNoteResSchema = {
  200: {
    description: 'Success',
    type: 'object',
    properties: {
      ...NoteListItemSchema.properties,
      ownerId: { type: 'string' },
      content: { type: 'string' },
      sharedWith: { type: 'array', items: { type: 'string' } },
    },
  },
  403: ErrorResSchema,
  404: ErrorResSchema,
} as const;

export const GetSharedNotesResSchema = {
  200: {
    description: 'Success',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        ownerId: { type: 'string' },
      },
    },
  },
  403: ErrorResSchema,
} as const;

export type CreateNoteReqBody = FromSchema<typeof CreateNoteReqBodySchema>;
export type EditNoteReqBody = FromSchema<typeof EditNoteReqBodySchema>;
export type ShareNoteReqBody = FromSchema<typeof ShareNoteReqBodySchema>;
export type NoteIdParams = FromSchema<typeof NoteIdParamsSchema>;
