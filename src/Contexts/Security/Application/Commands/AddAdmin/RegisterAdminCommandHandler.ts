import {
  CommandHandler,
  Result,
  IResult,
  ExecutionContext,
  NotAllowedException,
} from '@SharedKernel/Domain/Application';
import { Role } from '@SharedKernel/Domain/AccessControl';

import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { RegisterAdminCommandEvent } from './RegisterAdminCommandEvent';
import { AccountCreatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountCreatedEvent';

export class RegisterAdminCommandHandler extends CommandHandler<RegisterAdminCommandEvent> {
  constructor(private accountRepository: IAccountRepository) {
    super();
  }

  protected async guard(_: never, context: ExecutionContext): Promise<IResult> {
    if (!context.auth.role || ![Role.ADMIN].includes(context.auth.role)) {
      return Result.fail(new NotAllowedException('Admin', 'Forbidden'));
    }
    return Result.ok();
  }

  async execute(command: RegisterAdminCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const { identifier, password } = command.payload;

    // Create the Account entity
    const accountResult = Account.create({
      subjectId: identifier,
      subjectType: Role.ADMIN,
      credentials: {
        type: 'password',
        value: password,
      },
      isActive: true,
    });

    if (accountResult.isFailure()) {
      return Result.fail(accountResult.error);
    }

    const account = accountResult.data;

    // Save the Account entity
    await this.accountRepository.save(account);

    context.eventBus.publish(AccountCreatedEvent.set(account), context);
    // Return the Account ID
    return Result.ok(account._id);
  }
}
