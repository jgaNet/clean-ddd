/**
 * The Domain layer of the shared kernel: the building blocks every context's domain is
 * written with. It depends on nothing else in the project (the eslint boundary rules
 * enforce it), so a domain model built on it stays free of application and infrastructure
 * concerns.
 *
 * - DDD/           Entity, AggregateRoot, ValueObject, Event (+ the event kinds), Exception, Result
 * - Utils/         Id, Email, Nullable
 * - AccessControl/ Role
 *
 * The application-layer primitives (handlers, module, execution context, event bus) live
 * next door in `@SharedKernel/Application`.
 */
export * from './DDD';
export * from './Utils';
export * from './AccessControl';
