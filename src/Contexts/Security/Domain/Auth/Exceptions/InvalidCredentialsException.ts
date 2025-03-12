import { Exception } from '@Primitives';
export class InvalidCredentialsException extends Exception {
  constructor(message: string, context?: unknown) {
    super({
      service: 'Security',
      type: 'Invalid Credentials',
      message,
      context,
    });
  }
}
