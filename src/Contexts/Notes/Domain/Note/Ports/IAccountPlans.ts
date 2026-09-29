/**
 * What Notes needs to know about plans, in its own words: which plan an account is on, so that
 * NoteCreation can apply that plan's quota. Plans belong to the Billing context; Notes never
 * imports it. The infrastructure provides an adapter over Billing's read model
 * (BillingAccountPlans) that translates Billing's plans into these with a switch written out,
 * so a plan Billing adds tomorrow is a compile error here rather than a silent default.
 */
export enum AccountPlan {
  FREE = 'FREE',
  PRO = 'PRO',
}

export interface IAccountPlans {
  /** An account Billing has never heard of is on the free plan, like every account until an administrator changes it. */
  planOf(accountId: string): Promise<AccountPlan>;
}
