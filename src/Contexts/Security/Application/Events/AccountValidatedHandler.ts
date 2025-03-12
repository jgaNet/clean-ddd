import { EventHandler } from '@Primitives/EventHandler';
import { AccountValidatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountValidatedEvent';
import { IResult, Result } from '@Primitives/Result';
import { ExecutionContext } from '@Primitives/ExecutionContext';

export class AccountValidatedHandler extends EventHandler<AccountValidatedEvent> {
  async execute(event: AccountValidatedEvent, context: ExecutionContext): Promise<IResult> {
    if (context.logger) {
      context.logger.debug(`Account ${event.payload._id} validated`);
    }
    return Result.ok();
  }
}
