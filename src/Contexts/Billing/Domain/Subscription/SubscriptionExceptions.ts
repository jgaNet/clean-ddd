import { Exception } from '@SharedKernel/Domain';

/**
 * Domain exceptions of the Subscription aggregate: a broken business rule, in business words.
 * They are carried by Result.fail(), never thrown. One file per aggregate; the `type` is the
 * PascalCase name of the rule, as a client reads it on the operation.
 */
export class SubscriptionDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'Billing', type, message, context });
  }
}

export class UnknownPlanException extends SubscriptionDomainException {
  constructor(plan: string) {
    super({ type: 'UnknownPlan', message: 'There is no such plan', context: { plan } });
  }
}

export class UnknownAccountException extends SubscriptionDomainException {
  constructor(accountId: string) {
    super({ type: 'UnknownAccount', message: 'There is no account to put on a plan', context: { accountId } });
  }
}

export class AlreadyOnPlanException extends SubscriptionDomainException {
  constructor(accountId: string, plan: string) {
    super({
      type: 'AlreadyOnPlan',
      message: 'This account is already on that plan',
      context: { accountId, plan },
    });
  }
}
