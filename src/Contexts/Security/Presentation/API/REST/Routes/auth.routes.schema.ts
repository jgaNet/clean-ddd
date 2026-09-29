import { Role } from '@SharedKernel/Domain';
import { FromSchema } from 'json-schema-to-ts';

import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';

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

/** A command is accepted; its outcome is on the operation (GET /tracker/operations/:id). */
const AcceptedSchema = {
  type: 'object',
  properties: {
    operationId: { type: 'string', format: 'uuid' },
  },
} as const;

/** How a controller refuses a query: `{ message }` with the status that says why. */
const RefusedSchema = {
  type: 'object',
  properties: { message: { type: 'string' } },
} as const;

/** The presenters' error shape (login and me answer in JSON or HTMX, see the presenters). */
const PresentedErrorSchema = {
  type: 'object',
  properties: { error: { type: 'string' } },
} as const;

export const AccountSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    role: { type: 'string', enum: Object.values(Role) },
    status: { type: 'string', enum: Object.values(AccountStatus) },
    lastAuthenticatedAt: { type: 'string', format: 'date-time' },
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
    401: PresentedErrorSchema,
  },
};

export const signUpSchema = {
  description: 'Sign up (the account is pending until its email is validated)',
  tags: ['auth'],
  body: BasicSignupReqBodySchema,
  response: {
    202: AcceptedSchema,
  },
};

export const validateAccountSchema = {
  description: 'Validate an account with the token it was emailed',
  tags: ['auth'],
  query: ValidateAccountReqBodySchema,
  response: {
    202: AcceptedSchema,
  },
};

export const validateAccountByIdSchema = {
  description: 'Validate an account by id (administrators only; the outcome is on the operation)',
  tags: ['accounts'],
  params: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
  },
  response: {
    202: AcceptedSchema,
  },
};

export const unlockAccountByIdSchema = {
  description:
    'Unlock an account locked by too many wrong passwords (administrators only; the outcome is on the operation)',
  tags: ['accounts'],
  params: {
    type: 'object',
    properties: {
      id: { type: 'string' },
    },
  },
  response: {
    202: AcceptedSchema,
  },
};

export const meSchema = {
  description: 'Get the authenticated account',
  tags: ['auth'],
  response: {
    200: AccountSchema,
    400: PresentedErrorSchema,
    401: PresentedErrorSchema,
  },
};

export const getAccountByIdSchema = {
  description: 'Get an account (its owner or an administrator)',
  tags: ['accounts'],
  params: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: AccountSchema,
    400: RefusedSchema,
    403: RefusedSchema,
    404: RefusedSchema,
  },
};

export const logoutSchema = {
  description: 'Logout',
  tags: ['auth'],
  response: {
    200: {
      type: 'string',
    },
  },
};

export type BasicLoginReqBody = FromSchema<typeof BasicLoginReqBodySchema>;
export type BasicSignUpReqBody = FromSchema<typeof BasicSignupReqBodySchema>;
export type ValidateAcccountReqBody = FromSchema<typeof ValidateAccountReqBodySchema>;
