import { Role } from '@SharedKernel/Domain';

import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';

/**
 * Snapshot of an Account: the plain data the aggregate is persisted as and rebuilt from.
 * It is the only shape that crosses the domain boundary towards the infrastructure.
 */
export interface IAccount {
  _id: string;
  email: string;
  role: Role;
  credentials: { type: 'password'; hash: string };
  status: AccountStatus;
  lastAuthenticatedAt?: Date;
}

/** What is needed to register a brand new account. */
export interface INewAccount {
  email: string;
  role: Role;
  passwordHash: string;
  /** An administrator's account is usable at once; a self-registered one awaits validation. */
  activated: boolean;
}
