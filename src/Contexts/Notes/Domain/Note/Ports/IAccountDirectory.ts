/**
 * The plans Notes distinguishes, in its own words. Security owns the plan an account is on;
 * what each plan allows here (how many notes) is Notes' rule, in NoteCreation. The adapter
 * translates Security's plan into this one, so that Security may rename or add plans without
 * Notes noticing until it decides to care.
 */
export enum AccountPlan {
  FREE = 'FREE',
  PRO = 'PRO',
}

/**
 * What Notes needs to know about accounts, in its own words: whether one exists, and which
 * plan it is on. The accounts themselves belong to the Security context; Notes never imports
 * it. The infrastructure provides an adapter over Security's read model (SecurityAccountDirectory),
 * which is the read-side counterpart of the anti-corruption layer used for events.
 */
export interface IAccountDirectory {
  exists(accountId: string): Promise<boolean>;
  /** An account the directory does not know is on the free plan: the most restrictive answer. */
  planOf(accountId: string): Promise<AccountPlan>;
}
