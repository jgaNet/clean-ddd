import { IResult, Result } from '@SharedKernel/Domain';
import { CommandHandler, ExecutionContext } from '@SharedKernel/Application';

import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { IJwtService } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import { InvalidCredentialsException } from '@Contexts/Security/Domain/Account/AccountExceptions';
import { LoginCommandEvent } from './LoginCommandEvent';

/**
 * Login answers synchronously (the caller needs the token), so the controller calls
 * `execute()` directly instead of publishing the command on the bus.
 *
 * A wrong password is a refusal with a side effect: the aggregate counts it, and the count
 * is saved before the failed Result is returned (the fifth in a row locks the account).
 * That write survives the refusal because login runs outside `handle()`'s transaction;
 * published on the bus, a failed Result would roll it back and drop its events.
 */
export class LoginCommandHandler extends CommandHandler<LoginCommandEvent> {
  constructor(
    private accountRepository: IAccountRepository,
    private passwordHasher: IPasswordHasher,
    private jwtService: IJwtService,
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
      account.recordFailedLogin();
      await this.accountRepository.save(account);
      this.publishDomainEvents(account, context);

      return Result.fail(new InvalidCredentialsException());
    }

    const authenticated = account.authenticate();
    if (authenticated.isFailure()) return authenticated;

    await this.accountRepository.save(account);
    this.publishDomainEvents(account, context);

    const token = await this.jwtService.sign({ subjectId: account._id.value, subjectType: account.role });
    return Result.ok({ token });
  }
}
