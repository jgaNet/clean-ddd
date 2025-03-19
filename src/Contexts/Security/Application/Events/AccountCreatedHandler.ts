import { EventHandler, IResult, Result, ExecutionContext } from '@SharedKernel/Domain/Application';
import { AccountCreatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountCreatedEvent';
import { IJwtService } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';
import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';
import { AccountCreatedIntegrationEvent } from '@SharedKernel/Application/IntegrationEvents/AccountIntegrationEvents';

export class AccountCreatedHandler extends EventHandler<AccountCreatedEvent> {
  constructor(private jwtService: IJwtService) {
    super();
  }

  async execute(event: AccountCreatedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Account ${event.payload._id} created`, {
      traceId: context.traceId,
    });

    const idToken = this.jwtService.sign({
      subjectId: event.payload._id,
      subjectType: TokenTypes.VALIDATION,
    });

    // Publish integration event for notifications
    const integrationEvent = AccountCreatedIntegrationEvent.set({
      accountId: event.payload._id,
      email: event.payload.subjectId,
      validationToken: idToken,
    });

    context.eventBus.publish(integrationEvent, context);

    return Result.ok();
  }
}
