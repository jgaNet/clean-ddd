import { Logger } from '@SharedKernel/Domain';

/**
 * Simple console logger implementation
 */
export class ConsoleLogger implements Logger {
  #debug: boolean;
  constructor({ debug }: { debug: boolean }) {
    this.#debug = debug;
  }
  /**
   * Log an info message
   * @param message The message to log
   * @param meta Additional metadata to log
   */
  info(message: string, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info(
      `\x1b[36;20m${
        meta?.traceId ? `[${meta?.traceId}]` : '[************************************]'
      } [INFO]  ${message} \x1b[0m`,
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
      `\x1b[33;20m${
        meta?.traceId ? `[${meta?.traceId}]` : '[************************************]'
      } [WARN] ${message}\x1b[0m`,
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
      `\x1b[91;20m${
        meta?.traceId ? `[${meta?.traceId}]` : '[************************************]'
      } [ERROR] ${message}\x1b[0m`,
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
    if (!this.#debug) {
      return;
    }

    // eslint-disable-next-line no-console
    console.debug(
      `\x1b[35;20m${
        meta?.traceId ? `[${meta?.traceId}]` : '[************************************]'
      } [DEBUG] ${message}\x1b[0m`,
      meta && !meta.traceId ? meta : '',
    );
  }
}
