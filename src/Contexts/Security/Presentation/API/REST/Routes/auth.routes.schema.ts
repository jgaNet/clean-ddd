import { FromSchema } from 'json-schema-to-ts';

const BasicLoginReqBodySchema = {
  type: 'object',
  required: ['identifier', 'password'],
  properties: {
    identifier: {
      type: 'string',
      description: 'User identifier (email, username, etc.)',
    },
    password: {
      type: 'string',
      description: 'User password',
    },
  },
} as const;

export const loginSchema = {
  description: 'Login with credentials to receive an authentication token',
  tags: ['security'],
  body: BasicLoginReqBodySchema,
  response: {
    200: {
      type: 'object',
      properties: {
        token: { type: 'string' },
      },
    },
    401: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
  },
};

const BasicSignupReqBodySchema = {
  type: 'object',
  required: ['identifier', 'password'],
  properties: {
    identifier: {
      type: 'string',
      description: 'User identifier (email, username, etc.)',
    },
    password: {
      type: 'string',
      description: 'User password',
    },
  },
} as const;

export const signUpSchema = {
  description: 'SignUp',
  tags: ['security'],
  body: BasicSignupReqBodySchema,
  response: {
    200: {
      type: 'object',
      properties: {
        operationId: { type: 'string' },
      },
    },
    401: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
  },
};

const ValidateAccountReqBodySchema = {
  type: 'object',
  required: ['validation_token'],
  properties: {
    validation_token: {
      type: 'string',
      description: 'Validation token',
    },
  },
} as const;

export const validateAccountSchema = {
  description: 'SignUp',
  tags: ['security'],
  query: ValidateAccountReqBodySchema,
  response: {
    200: {
      type: 'object',
      properties: {
        operationId: { type: 'string' },
      },
    },
    401: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
  },
};

export type BasicLoginReqBody = FromSchema<typeof BasicLoginReqBodySchema>;
export type BasicSignUpReqBody = FromSchema<typeof BasicSignupReqBodySchema>;
export type ValidateAcccountReqBody = FromSchema<typeof ValidateAccountReqBodySchema>;
