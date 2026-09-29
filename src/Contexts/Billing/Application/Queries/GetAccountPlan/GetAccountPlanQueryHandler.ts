import { IResult, NotAllowedException, Result, Role } from '@SharedKernel/Domain';
import { ExecutionContext, QueryHandler, requireSignedIn } from '@SharedKernel/Application';

import {
  AccountPlanDetail,
  ISubscriptionQueries,
} from '@Contexts/Billing/Domain/Subscription/Ports/ISubscriptionQueries';

/**
 * An administrator may read the plan of any account; an account may read its own. The answer
 * never is "not found": an account without a subscription is on the default plan, and whether
 * the account exists at all is Security's question (GET /auth/accounts/:id).
 */
export class GetAccountPlanQueryHandler extends QueryHandler<ISubscriptionQueries, string, IResult<AccountPlanDetail>> {
  protected async guard(accountId: string, context: ExecutionContext): Promise<IResult<unknown>> {
    const reader = requireSignedIn(context, 'Billing');
    if (reader.isFailure()) return reader;

    if (context.auth.role !== Role.ADMIN && reader.data.value !== accountId) {
      return Result.fail(new NotAllowedException('Billing', 'Only the account or an administrator can read its plan'));
    }
    return Result.ok();
  }

  async execute(accountId: string): Promise<IResult<AccountPlanDetail>> {
    return Result.ok(await this.queries.planOf(accountId));
  }
}
