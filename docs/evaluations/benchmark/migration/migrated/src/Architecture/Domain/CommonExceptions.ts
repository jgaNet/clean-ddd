import { Exception } from './Exception';

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
      service: service || 'unknown',
      type: 'NotFound',
      message,
      context,
    });
  }
}

export class NotAllowedException extends Exception {
  constructor(service: string, message: string, context?: unknown) {
    super({
      service: service || 'unknown',
      type: 'NotAllowed',
      message,
      context,
    });
  }
}

/** The aggregate changed since it was read: the caller re-reads and decides again (ADR 8). */
export class ConcurrencyConflictException extends Exception {
  constructor(service: string, message: string, context?: unknown) {
    super({
      service: service || 'unknown',
      type: 'ConcurrencyConflict',
      message,
      context,
    });
  }
}
