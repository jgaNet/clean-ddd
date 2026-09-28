import { DomainEvent, Role } from '@SharedKernel/Domain';

import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';

/**
 * Facts raised by the Account aggregate. They stay inside the Security context; the
 * application handlers translate the ones other contexts care about into integration events
 * (see Application/Events).
 */

export class AccountCreatedEvent extends DomainEvent<{
  accountId: string;
  email: string;
  role: Role;
  status: AccountStatus;
}> {}

export class AccountValidatedEvent extends DomainEvent<{ accountId: string; email: string }> {}

export class AccountAuthenticatedEvent extends DomainEvent<{ accountId: string; at: Date }> {}
