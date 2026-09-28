import { Exception } from '@SharedKernel/Domain';
export class InvalidAccountException extends Exception {
  constructor(message: string, context?: unknown) {
    super({
      service: 'Security',
      type: 'Invalid Account',
      message,
      context,
    });
  }
}

export class ActivationFailedException extends Exception {
  constructor(message: string, context?: unknown) {
    super({
      service: 'Security',
      type: 'Account Activation Failed',
      message,
      context,
    });
  }
}
