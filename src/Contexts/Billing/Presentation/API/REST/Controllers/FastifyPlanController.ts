import { FastifyReply, FastifyRequest } from 'fastify';

import { Exception, NotAllowedException } from '@SharedKernel/Domain';
import { Module } from '@SharedKernel/Application';

import { SetAccountPlanCommandEvent } from '@Contexts/Billing/Application/Commands';
import { GetAccountPlanQueryHandler } from '@Contexts/Billing/Application/Queries';
import {
  AccountIdParams,
  SetAccountPlanReqBody,
} from '@Contexts/Billing/Presentation/API/REST/Routes/plan.routes.schema';

/**
 * The plan of an account, as an administrator (or the account itself) sees it. Same shape as
 * FastifyNoteController: a command is accepted (202) and followed through its operation; a
 * query answers synchronously. The query never answers "not found" (an unknown account is on
 * the default plan), so refuse() has no 404 branch.
 */
export class FastifyPlanController {
  #billingModule: Module;

  constructor({ module }: { module: Module }) {
    this.#billingModule = module;
  }

  async setAccountPlan(
    req: FastifyRequest<{ Params: AccountIdParams; Body: SetAccountPlanReqBody }>,
    reply: FastifyReply,
  ) {
    const context = req.executionContext;
    const operation = context.eventBus.publish(
      SetAccountPlanCommandEvent.set({ accountId: req.params.accountId, plan: req.body.plan }),
      context,
    );

    reply.code(202);
    return { operationId: operation.id };
  }

  async getAccountPlan(req: FastifyRequest<{ Params: AccountIdParams }>, reply: FastifyReply) {
    const result = await this.#billingModule
      .getQuery(GetAccountPlanQueryHandler)
      .handle(req.params.accountId, req.executionContext);

    return result.isFailure() ? this.refuse(reply, result.error) : result.data;
  }

  private refuse(reply: FastifyReply, error: Exception) {
    if (error instanceof NotAllowedException) reply.code(403);
    else reply.code(400);

    return { message: error.message };
  }
}
