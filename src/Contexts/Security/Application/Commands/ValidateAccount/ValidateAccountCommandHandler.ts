import { CommandHandler, Result, IResult, ExecutionContext } from '@SharedKernel/Domain';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { ValidateAccountCommandEvent } from './ValidateAccountCommandEvent';
import { AccountValidatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountValidatedEvent';
import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';
import { accountMapper } from '@Contexts/Security/Domain/Account/AccountMapper';

export class ValidateAccountCommandHandler extends CommandHandler<ValidateAccountCommandEvent> {
  constructor(private accountRepository: IAccountRepository) {
    super();
  }

  async execute(command: ValidateAccountCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    try {
      const { subjectId, subjectType } = command.payload;

      if (subjectType !== TokenTypes.VALIDATION) {
        return Result.fail('Not a valid token');
      }

      // Save the Account entity
      const account = await this.accountRepository.findById(subjectId);

      if (!account) {
        return Result.fail('Activation failed');
      }

      account.activate();

      context.logger?.debug(`Account ${account._id.value} activated`, { account });
      await this.accountRepository.save(account);

      // Publish the AccountValidatedEvent
      context.eventBus.publish(AccountValidatedEvent.set(accountMapper.toJSON(account)), context);

      // Return the Account ID
      return Result.ok(account._id.value);
    } catch (error) {
      return Result.fail(error);
    }
  }
}
