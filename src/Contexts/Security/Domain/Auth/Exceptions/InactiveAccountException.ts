import { Exception } from '@SharedKernel/Domain';
export class InactiveAccountException extends Exception {
  constructor(message: string, context?: unknown) {
    super({
      service: 'Security',
      type: 'Inactive Account',
      message,
      context,
    });
  }
}
