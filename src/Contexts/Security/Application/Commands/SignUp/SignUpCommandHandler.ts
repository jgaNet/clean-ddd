import { CommandHandler, Result, IResult, ExecutionContext } from '@Primitives/Application';
import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { SignUpCommandEvent } from './SignUpCommandEvent';
import { AccountCreatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountCreatedEvent';

export class SignUpCommandHandler extends CommandHandler<SignUpCommandEvent> {
  constructor(private accountRepository: IAccountRepository) {
    super();
  }

  async execute(command: SignUpCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const { subjectId, subjectType, credentials, isActive } = command.payload;

    // Create the Account entity
    const accountResult = Account.create({
      subjectId,
      subjectType,
      credentials,
      isActive,
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
