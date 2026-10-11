import { Role } from '@SharedKernel/Domain';

import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';

/** Read model of an account: what a screen or an API may show. Never the credentials. */
export interface AccountDetail {
  id: string;
  email: string;
  role: Role;
  status: AccountStatus;
  lastAuthenticatedAt?: Date;
}

export interface IAccountQueries {
  findById(id: string): Promise<AccountDetail | null>;
}
