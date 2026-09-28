import { Role } from '@SharedKernel/Domain';
import { FromSchema } from 'json-schema-to-ts';

const BasicLoginReqBodySchema = {
  type: 'object',
  required: ['identifier', 'password'],
  properties: {
    identifier: {
      type: 'string',
      format: 'email',
      description: 'User identifier (email)',
    },
    password: {
      type: 'string',
      description: 'User password',
    },
  },
} as const;

export const loginSchema = {
  description: 'Login with credentials to receive an authentication token',
  tags: ['auth'],
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
      format: 'email',
      description: 'User identifier (email)',
    },
    password: {
      type: 'string',
      description: 'User password',
    },
  },
} as const;

export const signUpSchema = {
  description: 'SignUp',
  tags: ['auth'],
  body: BasicSignupReqBodySchema,
  response: {
    200: {
      type: 'object',
      properties: {
        operationId: { type: 'string', format: 'uuid' },
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
  description: 'Validate an account with token',
  tags: ['auth'],
  query: ValidateAccountReqBodySchema,
  response: {
    200: {
      type: 'object',
      properties: {
        operationId: { type: 'string', format: 'uuid' },
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

export const validateAccountByIdSchema = {
  description: 'Validate account with ID (available only for admins)',
  tags: ['accounts'],
  params: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        operationId: { type: 'string', format: 'uuid' },
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

export const AccountSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: Object.values(Role) },
    status: { type: 'string', enum: ['pending', 'active'] },
    lastAuthenticatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const meSchema = {
  description: 'Get autenticated account informations',
  tags: ['auth'],
  response: {
    200: AccountSchema,
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

export const getAccountByIdSchema = {
  description: 'Get account informations',
  tags: ['accounts'],
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: AccountSchema,
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

export const logoutSchema = {
  description: 'Logout',
  tags: ['auth'],
  response: {
    200: {
      type: 'string',
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
