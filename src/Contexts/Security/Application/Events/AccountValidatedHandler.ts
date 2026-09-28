import { IResult, Result } from '@SharedKernel/Domain';
import { EventHandler, ExecutionContext } from '@SharedKernel/Application';
import { AccountValidatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';

import { AccountValidatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';

export class AccountValidatedHandler extends EventHandler<AccountValidatedEvent> {
  async execute({ payload }: AccountValidatedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Account ${payload.accountId} validated`, { traceId: context.traceId });

    context.eventBus.publish(
      AccountValidatedIntegrationEvent.set({ accountId: payload.accountId, email: payload.email }),
      context,
    );

    return Result.ok();
  }
}
