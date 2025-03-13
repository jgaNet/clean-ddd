import { EventHandler, IResult, Result, ExecutionContext } from '@SharedKernel/Domain/Application';
import { AccountValidatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountValidatedEvent';

export class AccountValidatedHandler extends EventHandler<AccountValidatedEvent> {
  async execute(event: AccountValidatedEvent, context: ExecutionContext): Promise<IResult> {
    if (context.logger) {
      context.logger.debug(`Account ${event.payload._id} validated`);
    }
    return Result.ok();
  }
}
