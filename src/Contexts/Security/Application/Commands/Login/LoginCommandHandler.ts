import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { ISignedTokens } from '@Contexts/Security/Domain/Auth/Ports/ISignedTokens';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import { InvalidCredentialsException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { LoginCommandEvent } from './LoginCommandEvent';

/**
 * Login answers synchronously (the caller needs the token), so the controller calls
 * `execute()` directly instead of publishing the command on the bus.
 */
export class LoginCommandHandler extends CommandHandler<LoginCommandEvent> {
  constructor(
    private accountRepository: IAccountRepository,
    private passwordHasher: IPasswordHasher,
    private signedTokens: ISignedTokens,
  ) {
    super();
  }

  async execute({ payload }: LoginCommandEvent, context: ExecutionContext): Promise<IResult<{ token: string }>> {
    const account = await this.accountRepository.findByEmail(payload.identifier);
    if (!account) {
      return Result.fail(new InvalidCredentialsException());
    }

    const passwordMatches = await this.passwordHasher.compare(payload.password, account.credentials.hash);
    if (!passwordMatches) {
      return Result.fail(new InvalidCredentialsException());
    }

    const authenticated = account.authenticate();
    if (authenticated.isFailure()) return authenticated;

    await this.accountRepository.save(account);
    this.publishDomainEvents(account, context);

    const token = await this.signedTokens.issue({ subjectId: account._id.value, subjectType: account.role });
    return Result.ok({ token });
  }
}
