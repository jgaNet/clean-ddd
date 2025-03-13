import { Exception } from '@SharedKernel/Domain/DDD';
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
