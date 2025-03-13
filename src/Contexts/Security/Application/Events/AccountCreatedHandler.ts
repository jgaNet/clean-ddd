import { EventHandler, IResult, Result, ExecutionContext } from '@SharedKernel/Domain/Application';
import { AccountCreatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountCreatedEvent';
import { IJwtService } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';

export class AccountCreatedHandler extends EventHandler<AccountCreatedEvent> {
  constructor(private jwtService: IJwtService) {
    super();
  }

  async execute(event: AccountCreatedEvent, context: ExecutionContext): Promise<IResult> {
    context.logger?.debug(`Account ${event.payload._id} created`);

    const idToken = this.jwtService.sign({
      subjectId: event.payload._id,
      subjectType: 'validation_token',
    });

    context.logger?.debug(`Token ${idToken} created`);

    return Result.ok();
  }
}
