import { IResult, NotAllowedException, Result } from '@Architecture/Domain';
import { Role } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';

import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { ISignedTokens } from '@Contexts/Security/Domain/Auth/Ports/ISignedTokens';
import { AccountNotFoundException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';
import { ValidateAccountCommandEvent } from './ValidateAccountCommandEvent';

/**
 * Who may validate an account: an administrator, for any account, or whoever holds the
 * validation token that was emailed for it. The token is verified here, not in the
 * controller, so that the rule cannot be bypassed by publishing the command another way.
 */
export class ValidateAccountCommandHandler extends CommandHandler<ValidateAccountCommandEvent> {
  constructor(
    private accountRepository: IAccountRepository,
    private signedTokens: ISignedTokens,
  ) {
    super();
  }

  async execute({ payload }: ValidateAccountCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const accountId = await this.accountIdAllowedFor(payload, context);
    if (accountId.isFailure()) return accountId;

    const account = await this.accountRepository.findById(accountId.data);
    if (!account) return Result.fail(new AccountNotFoundException(accountId.data));

    const validated = account.validate();
    if (validated.isFailure()) return validated;

    await this.accountRepository.save(account);
    this.publishDomainEvents(account, context);

    return Result.ok(account._id.value);
  }

  private async accountIdAllowedFor(
    payload: ValidateAccountCommandEvent['payload'],
    { auth }: ExecutionContext,
  ): Promise<IResult<string>> {
    if ('validationToken' in payload) {
      const claims = await this.signedTokens.verify(payload.validationToken);
      if (!claims || claims.subjectType !== TokenTypes.VALIDATION) {
        return Result.fail(new NotAllowedException('Security', 'Invalid validation token'));
      }
      return Result.ok(claims.subjectId);
    }

    if (auth.role !== Role.ADMIN) {
      return Result.fail(new NotAllowedException('Security', 'Only an administrator can validate an account by id'));
    }
    return Result.ok(payload.accountId);
  }
}
