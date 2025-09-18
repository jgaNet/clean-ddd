/**
 * Mapper is a primitive interface that defines the contract for bidirectional
 * data transformation between domain entities and their JSON representations.
 *
 * This interface is crucial for the infrastructure layer, enabling clean separation
 * between domain objects and their persistence/transport formats.
 *
 * Key characteristics:
 * - Generic types T (entity) and K (JSON representation)
 * - Bidirectional mapping support
 * - Type-safe transformations
 * - Used across all domain entities
 *
 * Core methods:
 * - toJSON: Transforms domain entity to JSON format
 * - toEntity: Reconstructs domain entity from JSON data
 *
 * Usage examples in the project:
 * - UserMapper: Maps User domain entity to/from IUser DTO
 * - Used in repositories for data persistence
 * - Used in API controllers for request/response handling
 * - Supports clean architecture boundaries
 */

/* eslint-disable  @typescript-eslint/no-explicit-any */
export interface Mapper<T, K extends Record<any, any>> {
  toJSON(entity: T): K;
  toEntity(json: K): T;
}
