/**
 * The plan an account is on. Every account starts on FREE; only an administrator moves it to
 * PRO (or back). What a plan entitles an account to is not Security's business: each context
 * that cares (Notes, for the number of notes) asks for the plan through a port it owns and
 * applies its own rule. The change itself is enforced by the Account aggregate.
 */
export enum AccountPlan {
  FREE = 'FREE',
  PRO = 'PRO',
}
