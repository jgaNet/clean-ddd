import { CommandHandler, Result, IResult, ExecutionContext } from '@Primitives';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { ValidateAccountCommandEvent } from './ValidateAccountCommandEvent';
import { AccountValidatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountValidatedEvent';

export class ValidateAccountCommandHandler extends CommandHandler<ValidateAccountCommandEvent> {
  constructor(private accountRepository: IAccountRepository) {
    super();
  }

  async execute(command: ValidateAccountCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    try {
      const { accountId } = command.payload;

      // Save the Account entity
      const account = await this.accountRepository.findById(accountId);

      if (!account) {
        return Result.fail('Activation failed');
      }

      account.activate();

      context.logger?.debug(`Account ${account._id} activated`, { account });
      await this.accountRepository.save(account);

      // Publish the AccountValidatedEvent
      context.eventBus.publish(AccountValidatedEvent.set(account), context);

      // Return the Account ID
      return Result.ok(account._id);
    } catch (error) {
      return Result.fail(error);
    }
  }
}
