/**
 * Nullable is a primitive type that represents values that can be either of type T
 * or null. It provides type-safe handling of potentially null values throughout
 * the application.
 *
 * Key characteristics:
 * - Generic type T for type-safe null handling
 * - Used in repository and query operations
 * - Enforces explicit null checking
 * - Improves type safety across the codebase
 *
 * Usage examples in the project:
 * - Repository methods: findById() -> Promise<Nullable<User>>
 * - Query results: findByEmail() -> Promise<Nullable<IUser>>
 * - Optional domain properties
 * - API response handling
 */

export type Nullable<T> = T | null;
