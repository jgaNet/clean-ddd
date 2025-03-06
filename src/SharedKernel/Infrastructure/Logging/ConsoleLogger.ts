import { Logger } from '@Primitives/ExecutionContext';

/**
 * Simple console logger implementation
 */
export class ConsoleLogger implements Logger {
  /**
   * Log an info message
   * @param message The message to log
   * @param meta Additional metadata to log
   */
  info(message: string, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info(
      `${meta?.traceId ? `[${meta?.traceId}]` : '[************************************]'} [INFO]  ${message}`,
      meta && !meta.traceId ? meta : '',
    );
  }

  /**
   * Log a warning message
   * @param message The message to log
   * @param meta Additional metadata to log
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.warn(
      `${meta?.traceId ? `[${meta?.traceId}]` : '[************************************]'} [WARN] ${message}`,
      meta && !meta.traceId ? meta : '',
    );
  }

  /**
   * Log an error message
   * @param message The message to log
   * @param error The error to log
   * @param meta Additional metadata to log
   */
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error(
      `${meta?.traceId ? `[${meta?.traceId}]` : '[************************************]'} [ERROR] ${message}`,
      error || '',
      meta && !meta.traceId ? meta : '',
    );
  }

  /**
   * Log a debug message
   * @param message The message to log
   * @param meta Additional metadata to log
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.debug(
      `${meta?.traceId ? `[${meta?.traceId}]` : '[************************************]'} [DEBUG] ${message}`,
      meta && !meta.traceId ? meta : '',
    );
  }
}
