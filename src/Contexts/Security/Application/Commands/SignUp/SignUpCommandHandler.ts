import { CommandHandler, Result, IResult, ExecutionContext } from '@SharedKernel/Domain/Application';
import { Account } from '@Contexts/Security/Domain/Account/Account';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { SignUpCommandEvent } from './SignUpCommandEvent';
import { AccountCreatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountCreatedEvent';
import { isRole } from '@Contexts/@SharedKernel/Domain';
import { accountMapper } from '@Contexts/Security/Domain/Account/AccountMapper';

export class SignUpCommandHandler extends CommandHandler<SignUpCommandEvent> {
  constructor(private accountRepository: IAccountRepository) {
    super();
  }

  protected async guard(command: SignUpCommandEvent, __: ExecutionContext): Promise<IResult> {
    const account = await this.accountRepository.findByIdentifier(command.payload.subjectId);

    if (account) {
      return Result.fail('Account already exists');
    }

    return Promise.resolve(Result.ok());
  }

  async execute(command: SignUpCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const { subjectId, subjectType, credentials, isActive } = command.payload;

    if (!isRole(subjectType)) {
      return Result.fail('Invalid subject type');
    }
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

    context.eventBus.publish(AccountCreatedEvent.set(accountMapper.toJSON(account)), context);
    // Return the Account ID
    return Result.ok(account._id.value);
  }
}
