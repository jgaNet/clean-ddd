/**
 * QueriesService is a primitive abstract class that provides the foundation for
 * implementing query services in the application, following CQRS principles.
 *
 * This class serves as a base for all query services, ensuring consistent
 * data access patterns and separation from command operations.
 *
 * Key characteristics:
 * - Generic type T extends DataSource for type-safe data access
 * - Separates read operations from write operations (CQRS)
 * - Works with various DataSource implementations
 * - Used by QueryHandlers for data retrieval
 *
 * Usage examples in the project:
 * - UserQueries: Implements user-related queries (findByEmail, findById)
 * - Used in GetUsersQueryHandler and similar query handlers
 * - Supports both InMemoryDataSource and other data source types
 * - Enables clean separation between read and write operations
 */

import { DataSource } from '@Primitives/DataSource';
export abstract class QueriesService<T extends DataSource<unknown>> {
  abstract dataSource: T;
}
