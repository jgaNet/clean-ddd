/**
 * The plans an account can be on. Every account starts on FREE (Subscription.DEFAULT_PLAN) and
 * only an administrator moves it to PRO; the Subscription aggregate owns that transition, not
 * this enum. What a plan allows (how many notes, say) is the business of the context that has
 * the quota: it asks which plan an account is on and applies its own rule.
 */
export enum Plan {
  FREE = 'FREE',
  PRO = 'PRO',
}

/** Tells a Plan from any other string, for input that comes from outside the domain (a command payload, a stored row). */
export function isPlan(value: unknown): value is Plan {
  return Object.values(Plan).includes(value as Plan);
}
