import { Exception } from '@Primitives';
export class InvalidTokenException extends Exception {
  constructor(message: string, context?: unknown) {
    super({
      service: 'Security',
      type: 'Invalid Token',
      message,
      context,
    });
  }
}
