/**
 * Repository is a primitive abstract class that implements the Repository Pattern,
 * providing a standardized way to handle data persistence operations.
 *
 * This class serves as the base for all repository implementations, ensuring
 * consistent data access patterns across different domain entities.
 *
 * Key characteristics:
 * - Generic type T for type-safe entity handling
 * - Abstract dataSource property for flexible storage implementations
 * - Works with DataSource primitive for actual storage operations
 * - Follows Domain-Driven Design (DDD) repository pattern
 *
 * Usage examples in the project:
 * - UserRepository: Manages User entity persistence
 * - Supports different implementations:
 *   - InMemoryUserRepository
 *   - MockedUserRepository
 * - Used by domain services and command handlers
 * - Maintains persistence ignorance in domain layer
 */

import { DataSource } from '@Primitives/DataSource';
export abstract class Repository<T> {
  abstract dataSource: DataSource<T>;
}
