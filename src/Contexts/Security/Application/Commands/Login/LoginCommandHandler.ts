import { CommandHandler, Result, IResult } from '@SharedKernel/Domain/Application';

import { IAccountRepository } from '@Contexts/Security/Domain/Account/Ports/IAccountRepository';
import { LoginCommandEvent } from './LoginCommandEvent';
import { IJwtService } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';
import * as bcrypt from 'bcrypt';
import { InvalidCredentialsException } from '@Contexts/Security/Domain/Auth/Exceptions/InvalidCredentialsException';
import { InactiveAccountException } from '@Contexts/Security/Domain/Auth/Exceptions/InactiveAccountException';
import { AccountToken } from '@Contexts/Security/Domain/Account/AccountToken';
import { isTokenType } from '@Contexts/Security/Domain/Auth/TokenTypes';
import { isRole } from '@Contexts/@SharedKernel/Domain';

interface LoginResult {
  token: string;
}

export class LoginCommandHandler extends CommandHandler<LoginCommandEvent> {
  constructor(private accountRepository: IAccountRepository, private jwtService: IJwtService) {
    super();
  }

  async execute(command: LoginCommandEvent): Promise<IResult<LoginResult>> {
    const { identifier, password } = command.payload;

    try {
      // Find the account by identifier (could be email, username, etc.)
      const account = await this.accountRepository.findByIdentifier(identifier);

      if (!account) {
        return Result.fail(new InvalidCredentialsException('Invalid credentials'));
      }

      if (!account.isActive) {
        return Result.fail(new InactiveAccountException('Account is inactive'));
      }

      // Verify password (using bcrypt's compare in a real implementation)
      const isPasswordValid =
        account.credentials.type === 'password' && (await bcrypt.compare(password, account.credentials.value));

      if (!isPasswordValid) {
        return Result.fail(new InvalidCredentialsException('Invalid credentials'));
      }

      account.authenticate();

      // Save the Account entity
      await this.accountRepository.save(account);

      // Generate JWT token using the injected service
      const accountToken = AccountToken.create({
        subjectId: account._id.value,
        subjectType: account.subjectType,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      if (accountToken.isFailure()) {
        return Result.fail('An error occurred during login');
      }

      if (!isTokenType(accountToken.data.subjectType) && !isRole(accountToken.data.subjectType)) {
        return Result.fail('Invalid subject type: ' + accountToken.data.subjectType);
      }

      const token = this.jwtService.sign({
        subjectId: accountToken.data.subjectId,
        subjectType: accountToken.data.subjectType,
      });

      // Return the token and user ID
      return Result.ok({ token });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error('An error occurred during login'));
    }
  }
}
