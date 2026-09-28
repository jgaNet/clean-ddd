import { IResult, NotAllowedException, Result, Role, isRole } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { AccountNotFoundException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { TokenTypes, isTokenType } from '@Contexts/Security/Domain/Auth/TokenTypes';
import { ValidateAccountCommandEvent } from './ValidateAccountCommandEvent';

/**
 * Two ways in: the validation token emailed at sign-up (subjectType VALIDATION), or an
 * administrator validating an account by id (subjectType ADMIN). The guard accepts nothing else.
 */
export class ValidateAccountCommandHandler extends CommandHandler<ValidateAccountCommandEvent> {
  constructor(private accountRepository: IAccountRepository) {
    super();
  }

  protected async guard({ payload }: ValidateAccountCommandEvent): Promise<IResult<unknown>> {
    const { subjectType } = payload;

    if (isTokenType(subjectType) && subjectType === TokenTypes.VALIDATION) return Result.ok();
    if (isRole(subjectType) && subjectType === Role.ADMIN) return Result.ok();

    return Result.fail(new NotAllowedException('Security', 'Invalid token type'));
  }

  async execute({ payload }: ValidateAccountCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const account = await this.accountRepository.findById(payload.subjectId);
    if (!account) return Result.fail(new AccountNotFoundException(payload.subjectId));

    const validated = account.validate();
    if (validated.isFailure()) return validated;

    await this.accountRepository.save(account);
    this.publishDomainEvents(account, context);

    return Result.ok(account._id.value);
  }
}
