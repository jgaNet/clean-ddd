import { CommandEvent } from '@SharedKernel/Domain';

import { AccountPlan } from '@Contexts/Security/Domain/Account/AccountPlan';

export class ChangeAccountPlanCommandEvent extends CommandEvent<{ accountId: string; plan: AccountPlan }> {}
