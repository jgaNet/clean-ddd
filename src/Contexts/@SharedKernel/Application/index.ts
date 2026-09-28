/**
 * The Application layer of the shared kernel: how use cases are expressed and wired.
 *
 * - CommandHandler / QueryHandler / EventHandler  the three kinds of use case
 * - ExecutionContext                              who is calling, with which logger, bus and unit of work
 * - EventBus / Operation / IEventEmitter          publishing and following events
 * - Module                                        wiring one bounded context together
 * - Application                                   starting the modules
 * - IntegrationEvents/                            the events contexts exchange
 *
 * It depends on `@SharedKernel/Domain` only. Files in this folder import their siblings by
 * path (not through this barrel) to keep the module graph free of cycles.
 */
export * from './Application';
export * from './CommandHandler';
export * from './DomainEvents';
export * from './EventBus';
export * from './EventEmitter';
export * from './EventHandler';
export * from './ExecutionContext';
export * from './Guards';
export * from './Module';
export * from './Operation';
export * from './QueryHandler';
