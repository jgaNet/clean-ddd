import { Exception } from '@SharedKernel/Domain/DDD';
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
