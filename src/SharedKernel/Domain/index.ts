/**
 * The shared kernel, in the DDD sense: the small part of the domain model every context
 * agrees on. Two things today, an Email and the Roles; the published contracts between
 * contexts are next door in Application/IntegrationEvents.
 */
export * from './Email';
export * from './Role';
