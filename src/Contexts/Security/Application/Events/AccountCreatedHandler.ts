import { IResult, Result } from '@Architecture/Domain';
import { EventHandler, ExecutionContext } from '@Architecture/Application';
import { AccountCreatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';

import { AccountCreatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { ISignedTokens } from '@Contexts/Security/Domain/Auth/Ports/ISignedTokens';
import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';
import { AccountStatus } from '@Contexts/Security/Domain/Account/AccountStatus';

/**
 * Translates the domain fact into what other contexts need: a validation token the
 * Notifications context will email to the new account. An account opened active (by an
 * administrator, or the seed) has nothing to validate, so nothing leaves the context.
 */
export class AccountCreatedHandler extends EventHandler<AccountCreatedEvent> {
  constructor(private signedTokens: ISignedTokens) {
    super();
  }

  async execute({ payload }: AccountCreatedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Account ${payload.accountId} created`, { traceId: context.traceId });
    if (payload.status === AccountStatus.ACTIVE) return Result.ok();

    const validationToken = await this.signedTokens.issue({
      subjectId: payload.accountId,
      subjectType: TokenTypes.VALIDATION,
    });

    context.eventBus.publish(
      AccountCreatedIntegrationEvent.set({ accountId: payload.accountId, email: payload.email, validationToken }),
      context,
    );

    return Result.ok();
  }
}
