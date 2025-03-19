import { EventHandler, IResult, Result, ExecutionContext } from '@SharedKernel/Domain/Application';
import { AccountValidatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountValidatedEvent';
import { AccountValidatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';

export class AccountValidatedHandler extends EventHandler<AccountValidatedEvent> {
  async execute(event: AccountValidatedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Account ${event.payload._id} validated`, { traceId: context.traceId });

    // Publish integration event for notifications
    const integrationEvent = AccountValidatedIntegrationEvent.set({
      accountId: event.payload._id,
      email: event.payload.subjectId,
    });

    context.eventBus.publish(integrationEvent, context);

    return Result.ok();
  }
}
