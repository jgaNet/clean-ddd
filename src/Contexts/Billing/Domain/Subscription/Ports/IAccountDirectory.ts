/**
 * What Billing needs to know about accounts, in its own words: whether one exists, so that no
 * plan is set for an account that is not there. The accounts belong to the Security context;
 * Billing never imports it. The infrastructure provides an adapter over Security's read model
 * (SecurityAccountDirectory), the same shape Notes uses to check a recipient.
 */
export interface IAccountDirectory {
  exists(accountId: string): Promise<boolean>;
}
