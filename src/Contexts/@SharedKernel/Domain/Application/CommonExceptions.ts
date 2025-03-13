import { Exception } from '../DDD/Exception';

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
