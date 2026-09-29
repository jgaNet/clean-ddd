import { FromSchema } from 'json-schema-to-ts';

import { Plan } from '@Contexts/Billing/Domain/Subscription/Plan';

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

const AccountIdParamsSchema = {
  type: 'object',
  properties: { accountId: { type: 'string' } },
  required: ['accountId'],
} as const;

// The allowed values are shape, listed from the domain enum: a new plan needs no schema change.
export const SetAccountPlanReqBodySchema = {
  type: 'object',
  properties: {
    plan: { type: 'string', enum: Object.values(Plan) },
  },
  required: ['plan'],
} as const;

const AccountPlanSchema = {
  type: 'object',
  properties: {
    accountId: { type: 'string' },
    plan: { type: 'string', enum: Object.values(Plan) },
  },
} as const;

export const SetAccountPlanSchema = {
  description: 'Put an account on a plan (administrators only; the outcome is on the operation)',
  params: AccountIdParamsSchema,
  body: SetAccountPlanReqBodySchema,
  response: {
    202: AcceptedResSchema,
  },
} as const;

export const GetAccountPlanSchema = {
  description:
    'The plan an account is on (the account itself or an administrator); free unless an administrator changed it',
  params: AccountIdParamsSchema,
  response: {
    200: AccountPlanSchema,
    403: ErrorResSchema,
  },
} as const;

export type AccountIdParams = FromSchema<typeof AccountIdParamsSchema>;
export type SetAccountPlanReqBody = FromSchema<typeof SetAccountPlanReqBodySchema>;
