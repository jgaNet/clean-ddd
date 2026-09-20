import { Exception } from '@Core/Domain/Exception';

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

export class InvalidEmailFormat extends Exception {
  constructor({ service, email }: { service?: string; email: string }) {
    super({
      service: service || 'unknown',
      type: 'InvalidEmailFormat',
      message: 'Invalid email format',
      context: { email },
    });
  }
}
