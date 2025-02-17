/**
 * DataSource is a primitive abstract class that provides a foundation for data storage and management.
 *
 * This class serves as a base interface for implementing various data storage solutions in the application,
 * providing a consistent way to handle collections of data regardless of the underlying storage mechanism.
 *
 * Key characteristics:
 * - Generic type T allows for type-safe storage of any data type
 * - Uses Map as the base collection structure for key-value pair storage
 * - Provides abstract methods that must be implemented by concrete data sources
 * - Follows the Repository Pattern principles
 *
 * Core components:
 * - collection: A Map that stores data with string keys and generic type values
 * - resetCollection: Method to clear/reset the data storage
 *
 * Usage:
 * Extend this class to create specific data sources for different entity types
 * (e.g., UserDataSource, ProductDataSource) with their respective storage implementations.
 */

export abstract class DataSource<T> {
  abstract collection: Map<string, T>;
  abstract resetCollection(): void;
}
