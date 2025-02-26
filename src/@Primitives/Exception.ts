/**
 * Exception is a primitive abstract class that provides the foundation for all
 * application-specific exceptions and error handling throughout the system.
 *
 * This class implements a structured approach to error handling, allowing for
 * detailed error context and consistent error management across different services.
 *
 * Key characteristics:
 * - Service-aware: Tracks which service threw the exception
 * - Type classification: Categorizes exceptions by type
 * - Context support: Carries additional error context data
 * - Equality comparison: Implements deep comparison of exception instances
 *
 * Core components:
 * - service: Identifies the service where the exception occurred
 * - type: Categorizes the exception type
 * - message: Human-readable error description
 * - context: Optional additional error data
 *
 * Usage in the project:
 * - Base class for domain exceptions (UserDomainException)
 * - Used in Result<T> for error handling
 * - Handled by ExceptionHandlers (AsyncExceptionHandler)
 * - Supports the UnknownException fallback type
 */

export abstract class Exception {
  service: string;
  type: string;
  message!: string;
  context?: unknown;

  constructor({
    service,
    type,
    message,
    context,
  }: {
    service: string;
    type: string;
    message: string;
    context?: unknown;
  }) {
    this.type = type;
    this.service = service;
    this.message = message;
    this.context = context || {};
  }

  equals(other: Exception): boolean {
    return (
      this.service === other.service &&
      this.type === other.type &&
      this.message === other.message &&
      JSON.stringify(this.context) === JSON.stringify(other.context)
    );
  }
}

export class UnknownException extends Exception {
  constructor(message: string, context?: unknown) {
    super({
      service: 'unknown',
      type: 'Unknown',
      message,
      context,
    });
  }
}

export class NotFoundException extends Exception {
  constructor(service: string, message: string, context?: unknown) {
    super({
      service,
      type: 'NotFound',
      message,
      context,
    });
  }
}
