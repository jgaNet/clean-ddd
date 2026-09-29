import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

import { Password } from '@Contexts/Security/Domain/Account/Password';
import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { IPasswordHasher } from '@Contexts/Security/Domain/Auth/Ports/IPasswordHasher';
import {
  AccountNotFoundException,
  InvalidCredentialsException,
} from '@Contexts/Security/Domain/Account/AccountExceptions';
import { ChangePasswordCommandEvent } from './ChangePasswordCommandEvent';

/**
 * A signed-in user changes their own password: the account is the caller's, never one named
 * in the payload. The current password is checked through the IPasswordHasher port, as Login
 * does; the new one is validated by the Password value object before it is hashed, then the
 * aggregate records the change.
 */
export class ChangePasswordCommandHandler extends CommandHandler<ChangePasswordCommandEvent> {
  constructor(
    private accountRepository: IAccountRepository,
    private passwordHasher: IPasswordHasher,
  ) {
    super();
  }

  async execute({ payload }: ChangePasswordCommandEvent, context: ExecutionContext): Promise<IResult> {
    const actor = requireSignedIn(context, 'Security');
    if (actor.isFailure()) return actor;

    const account = await this.accountRepository.findById(actor.data.value);
    if (!account) return Result.fail(new AccountNotFoundException(actor.data.value));

    const newPassword = Password.create(payload.newPassword);
    if (newPassword.isFailure()) return newPassword;

    const currentMatches = await this.passwordHasher.compare(payload.currentPassword, account.credentials.hash);
    if (!currentMatches) return Result.fail(new InvalidCredentialsException());

    const changed = account.changePassword(await this.passwordHasher.hash(newPassword.data.value));
    if (changed.isFailure()) return changed;

    await this.accountRepository.save(account);
    this.publishDomainEvents(account, context);

    return Result.ok();
  }
}
