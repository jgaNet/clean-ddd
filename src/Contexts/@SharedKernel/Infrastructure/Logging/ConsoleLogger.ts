import { Logger } from '@SharedKernel/Application';

/**
 * The Logger port on the console. Each line starts with the trace id when the meta carries
 * one, so the lines of one request can be grepped together; the rest of the meta is printed
 * after the message. The only place in the project allowed to write to the console.
 */
export class ConsoleLogger implements Logger {
  #debug: boolean;

  constructor({ debug }: { debug: boolean }) {
    this.#debug = debug;
  }

  info(message: string, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info(...this.line('36', 'INFO ', message, meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.warn(...this.line('33', 'WARN ', message, meta));
  }

  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.error(...this.line('91', 'ERROR', message, meta), error ?? '');
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (!this.#debug) return;

    // eslint-disable-next-line no-console
    console.debug(...this.line('35', 'DEBUG', message, meta));
  }

  private line(color: string, level: string, message: string, meta?: Record<string, unknown>): unknown[] {
    const { traceId, ...rest } = meta ?? {};
    const trace = typeof traceId === 'string' ? traceId : '************************************';
    const text = `\x1b[${color};20m[${trace}] [${level}] ${message}\x1b[0m`;

    return Object.keys(rest).length ? [text, rest] : [text];
  }
}
