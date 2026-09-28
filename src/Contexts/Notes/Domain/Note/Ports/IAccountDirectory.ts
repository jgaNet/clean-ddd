/**
 * What Notes needs to know about accounts, in its own words: whether one exists. The accounts
 * themselves belong to the Security context; Notes never imports it. The infrastructure
 * provides an adapter over Security's read model (SecurityAccountDirectory), which is the
 * read-side counterpart of the anti-corruption layer used for events.
 */
export interface IAccountDirectory {
  exists(accountId: string): Promise<boolean>;
}
