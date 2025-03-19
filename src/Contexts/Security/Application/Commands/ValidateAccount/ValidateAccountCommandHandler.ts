import {
  CommandHandler,
  Result,
  IResult,
  ExecutionContext,
  Role,
  isRole,
  NotAllowedException,
} from '@SharedKernel/Domain';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { ValidateAccountCommandEvent } from './ValidateAccountCommandEvent';
import { AccountValidatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountValidatedEvent';
import { isTokenType, TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';
import { accountMapper } from '@Contexts/Security/Domain/Account/AccountMapper';
import { ActivationFailedException } from '@Contexts/Security/Domain/Account/AccountExceptions';

export class ValidateAccountCommandHandler extends CommandHandler<ValidateAccountCommandEvent> {
  constructor(private accountRepository: IAccountRepository) {
    super();
  }
  async execute(command: ValidateAccountCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    try {
      const { subjectId } = command.payload;
      context.logger?.info(`Validating account ${subjectId}`);

      // Save the Account entity
      const account = await this.accountRepository.findById(subjectId);

      if (!account) {
        return Result.fail(new ActivationFailedException('Account not found'));
      }

      account.activate();

      context.logger?.debug(`Account ${account._id.value} activated`);
      await this.accountRepository.save(account);

      // Publish the AccountValidatedEvent
      context.eventBus.publish(AccountValidatedEvent.set(accountMapper.toJSON(account)), context);

      // Return the Account ID
      return Result.ok(account._id.value);
    } catch (error) {
      return Result.fail(error);
    }
  }
  protected async guard(command: ValidateAccountCommandEvent, _?: ExecutionContext): Promise<IResult> {
    const { subjectType } = command.payload;

    if (!isTokenType(subjectType) && !isRole(subjectType)) {
      return Result.fail(new NotAllowedException('Security', 'Invalid token type'));
    }

    if (isTokenType(subjectType) && subjectType !== TokenTypes.VALIDATION) {
      return Result.fail(new NotAllowedException('Security', 'Invalid token type'));
    }

    if (isRole(subjectType) && subjectType !== Role.ADMIN) {
      return Result.fail(new NotAllowedException('Security', 'Invalid subject type'));
    }

    return Result.ok();
  }
}
