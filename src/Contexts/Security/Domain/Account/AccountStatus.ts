/**
 * The lifecycle of an account. A self-registered account starts PENDING until its email is
 * validated; an account registered by an administrator starts ACTIVE. Only an ACTIVE account
 * can authenticate. Too many wrong passwords in a row make an ACTIVE account LOCKED until an
 * administrator unlocks it. The transitions are enforced by the Account aggregate.
 */
export enum AccountStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  LOCKED = 'LOCKED',
}
