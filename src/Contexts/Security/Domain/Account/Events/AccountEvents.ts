import { DomainEvent } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';

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

/** The fact only: the new credentials never travel in an event. */
export class AccountPasswordChangedEvent extends DomainEvent<{ accountId: string }> {}
