import { IResult, Result } from '@SharedKernel/Domain';
import { EventHandler, ExecutionContext } from '@SharedKernel/Application';
import { AccountCreatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';

import { AccountCreatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { IJwtService } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';
import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';

/**
 * Translates the domain fact into what other contexts need: a validation token the
 * Notifications context will email to the new account.
 */
export class AccountCreatedHandler extends EventHandler<AccountCreatedEvent> {
  constructor(private jwtService: IJwtService) {
    super();
  }

  async execute({ payload }: AccountCreatedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Account ${payload.accountId} created`, { traceId: context.traceId });

    const validationToken = await this.jwtService.sign({
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
