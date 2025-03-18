import { EventHandler, IResult, Result, ExecutionContext } from '@SharedKernel/Domain/Application';
import { AccountCreatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountCreatedEvent';
import { IJwtService } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';
import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';

export class AccountCreatedHandler extends EventHandler<AccountCreatedEvent> {
  constructor(private jwtService: IJwtService) {
    super();
  }

  async execute(event: AccountCreatedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Account ${event.payload._id} created`);

    const idToken = this.jwtService.sign({
      subjectId: event.payload._id,
      subjectType: TokenTypes.VALIDATION,
    });

    context.logger?.debug(`Token ${idToken} created`, { email: event.payload.subjectId });

    return Result.ok();
  }
}
