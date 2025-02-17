/**
 * QueryHandler is a primitive abstract class that implements the Query part of CQRS
 * (Command Query Responsibility Segregation) pattern in the application.
 *
 * This class provides a standardized way to handle read operations, working in
 * conjunction with QueriesService to access data sources.
 *
 * Key characteristics:
 * - Generic types for type-safe query handling:
 *   T: QueriesService type
 *   P: Query payload type
 *   R: Result type extending ResultValue
 * - Separation of read operations from write operations
 * - Async execution support
 *
 * Core features:
 * - Protected queriesService for data access
 * - Abstract execute method for query implementation
 * - Type-safe result handling through ResultValue
 *
 * Usage examples in the project:
 * - GetUsersQueryHandler: Retrieves user lists
 * - FindUserByIdQueryHandler: Looks up specific users
 * - Integrated with Module for query resolution
 * - Used in API controllers for read operations
 */

import { QueriesService } from '@Primitives/QueriesService';
import { DataSource } from '@Primitives/DataSource';
import { ResultValue } from './Result';

export abstract class QueryHandler<T extends QueriesService<DataSource<unknown>>, P, R extends ResultValue<unknown>> {
  protected queriesService: T;

  constructor(queriesService: T) {
    this.queriesService = queriesService;
  }

  abstract execute(payload?: P): Promise<R>;
}
