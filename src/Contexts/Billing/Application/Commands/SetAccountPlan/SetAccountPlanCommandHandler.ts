import { IResult, NotAllowedException, Result, Role } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { PlanAssignment } from '@Contexts/Billing/Domain/Subscription/PlanAssignment';
import { ISubscriptionRepository } from '@Contexts/Billing/Domain/Subscription/Ports/ISubscriptionRepository';
import { SetAccountPlanCommandEvent } from '@Contexts/Billing/Application/Commands/SetAccountPlan/SetAccountPlanCommandEvent';

/**
 * Reserved to administrators: which plan an account is on is a billing decision, not the
 * account's. The role rule needs no caller id, so it is a guard(); everything else that can be
 * refused (unknown account, unknown plan, already on it) is refused by PlanAssignment or by the
 * aggregate and comes back as a failed Result.
 */
export class SetAccountPlanCommandHandler extends CommandHandler<SetAccountPlanCommandEvent> {
  constructor(
    private subscriptionRepository: ISubscriptionRepository,
    private planAssignment: PlanAssignment,
  ) {
    super();
  }

  protected async guard(_: SetAccountPlanCommandEvent, { auth }: ExecutionContext): Promise<IResult<unknown>> {
    if (auth.role !== Role.ADMIN) {
      return Result.fail(new NotAllowedException('Billing', 'Only an administrator can set the plan of an account'));
    }
    return Result.ok();
  }

  async execute({ payload }: SetAccountPlanCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const subscription = await this.planAssignment.assign(payload.accountId, payload.plan);
    if (subscription.isFailure()) return subscription;

    await this.subscriptionRepository.save(subscription.data);
    this.publishDomainEvents(subscription.data, context);

    return Result.ok(subscription.data._id.value);
  }
}
