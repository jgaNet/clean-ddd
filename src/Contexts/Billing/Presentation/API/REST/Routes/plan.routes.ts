import { FastifyInstance } from 'fastify';

import { Module } from '@SharedKernel/Application';

import { FastifyPlanController } from '@Contexts/Billing/Presentation/API/REST/Controllers/FastifyPlanController';
import {
  AccountIdParams,
  GetAccountPlanSchema,
  SetAccountPlanReqBody,
  SetAccountPlanSchema,
} from '@Contexts/Billing/Presentation/API/REST/Routes/plan.routes.schema';

/**
 * Mounted under /billing. The account id another context owns sits behind a static segment
 * (`/accounts/:accountId/plan`), so the route reads as what it is: one part of an account,
 * replaced with PUT, read with GET.
 */
export const planRoutes = function (
  fastify: FastifyInstance,
  { billingModule }: { billingModule: Module },
  done: () => void,
) {
  const controller = new FastifyPlanController({ module: billingModule });
  const tags = ['billing'];

  fastify.put<{ Params: AccountIdParams; Body: SetAccountPlanReqBody }>(
    '/accounts/:accountId/plan',
    { schema: { tags, ...SetAccountPlanSchema } },
    controller.setAccountPlan.bind(controller),
  );

  fastify.get<{ Params: AccountIdParams }>(
    '/accounts/:accountId/plan',
    { schema: { tags, ...GetAccountPlanSchema } },
    controller.getAccountPlan.bind(controller),
  );

  done();
};
