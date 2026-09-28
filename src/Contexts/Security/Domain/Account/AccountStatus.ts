/**
 * The lifecycle of an account. A self-registered account starts PENDING until its email is
 * validated; an account registered by an administrator starts ACTIVE. Only an ACTIVE account
 * can authenticate. The transitions are enforced by the Account aggregate.
 */
export enum AccountStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
}
