/**
 * The building blocks every domain is written with: identity, entities, aggregates, value
 * objects, events, results and exceptions. They know nothing of any context, and nothing of
 * the shared kernel either: the mechanics of the architecture, not its vocabulary.
 */
export * from './Entity';
export * from './AggregateRoot';
export * from './ValueObject';
export * from './Id';
export * from './Event';
export * from './EventTypes';
export * from './Exception';
export * from './CommonExceptions';
export * from './Result';
