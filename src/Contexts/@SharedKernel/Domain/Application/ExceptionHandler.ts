/**
 * ExceptionHandler is a primitive abstract class that defines the contract for
 * exception handling across the application. It provides a standardized way to
 * handle and process exceptions in different contexts.
 *
 * Key characteristics:
 * - Abstract throw method for custom exception handling implementations
 * - Supports both typed exceptions and unknown errors
 * - Works with ExceptionEvent for event-driven error handling
 * - Used by both sync and async exception handlers
 *
 * Implementations in the project:
 * - AsyncExceptionHandler: Handles exceptions asynchronously via EventBus
 * - ThrowExceptionHandler: Directly throws exceptions
 *
 * Core features:
 * - Type-safe exception handling through ExceptionEvent
 * - Fallback unknown() method for untyped errors
 * - Promise-based async handling support
 * - Integration with the application's event system
 *
 * Usage examples:
 * - Used in Module for centralized error handling
 * - Integrated with CommandHandlers for operation errors
 * - Used in infrastructure layers for system-level exceptions
 */

import { Exception } from '@Primitives/Exception';
import { ExceptionEvent } from '@Primitives/EventTypes';

export abstract class ExceptionHandler {
  abstract throw(event: typeof ExceptionEvent<Exception>, error: Exception): Promise<void>;
  unknown(error: unknown): void {
    throw error;
  }
}
