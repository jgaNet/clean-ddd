import { Role } from '@SharedKernel/Domain';
import { ExecutionContext, Module } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { inMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';
import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import { v4 } from 'uuid';

import { IAccount } from '@Contexts/Security/Domain/Account/DTOs';
import { AccountRegistration } from '@Contexts/Security/Domain/Account/AccountRegistration';
import { AccountCreatedEvent, AccountValidatedEvent } from '@Contexts/Security/Domain/Account/Events/AccountEvents';
import { SignUpCommandEvent } from '@Contexts/Security/Application/Commands/SignUp/SignUpCommandEvent';
import { SignUpCommandHandler } from '@Contexts/Security/Application/Commands/SignUp/SignUpCommandHandler';
import { LoginCommandEvent } from '@Contexts/Security/Application/Commands/Login/LoginCommandEvent';
import { LoginCommandHandler } from '@Contexts/Security/Application/Commands/Login/LoginCommandHandler';
import { ValidateAccountCommandEvent } from '@Contexts/Security/Application/Commands/ValidateAccount/ValidateAccountCommandEvent';
import { ValidateAccountCommandHandler } from '@Contexts/Security/Application/Commands/ValidateAccount/ValidateAccountCommandHandler';
import { RegisterAdminCommandEvent } from '@Contexts/Security/Application/Commands/AddAdmin/RegisterAdminCommandEvent';
import { RegisterAdminCommandHandler } from '@Contexts/Security/Application/Commands/AddAdmin/RegisterAdminCommandHandler';
import { GetAccountQueryHandler } from '@Contexts/Security/Application/Queries/GetAccount/GetAccountQueryHandler';
import { AccountCreatedHandler } from '@Contexts/Security/Application/Events/AccountCreatedHandler';
import { AccountValidatedHandler } from '@Contexts/Security/Application/Events/AccountValidatedHandler';
import { InMemoryAccountRepository } from '@Contexts/Security/Infrastructure/Repositories/InMemoryAccountRepository';
import { InMemoryAccountQueries } from '@Contexts/Security/Infrastructure/Queries/InMemoryAccountQueries';
import { JwtService } from '@Contexts/Security/Infrastructure/Services/JwtService';
import { BcryptPasswordHasher } from '@Contexts/Security/Infrastructure/Services/BcryptPasswordHasher';
import { AuthenticationMiddleware } from '@Contexts/Security/Presentation/API/REST/Middlewares/FastifyJWTAuthenticationMiddleware';

const accountDataSource = new InMemoryDataSource<IAccount>();
const accountRepository = new InMemoryAccountRepository(accountDataSource);
export const accountQueries = new InMemoryAccountQueries(accountDataSource);

const accountRegistration = new AccountRegistration(accountRepository);
const passwordHasher = new BcryptPasswordHasher();

// Exposed to the bootstrap and to the routes: the token service and the request middleware.
export const jwtService = new JwtService({
  secret: SETTINGS.security.jwt.secret,
  expiresIn: SETTINGS.security.jwt.expiresIn,
});
export const authMiddleware = new AuthenticationMiddleware(accountQueries, jwtService);

export const localSecurityModule = new Module({
  name: 'Security',
  commands: [
    {
      event: SignUpCommandEvent,
      handlers: [new SignUpCommandHandler(accountRepository, accountRegistration, passwordHasher)],
    },
    { event: LoginCommandEvent, handlers: [new LoginCommandHandler(accountRepository, passwordHasher, jwtService)] },
    {
      event: ValidateAccountCommandEvent,
      handlers: [new ValidateAccountCommandHandler(accountRepository, jwtService)],
    },
  ],
  queries: [new GetAccountQueryHandler(accountQueries)],
  domainEvents: [
    { event: AccountCreatedEvent, handlers: [new AccountCreatedHandler(jwtService)] },
    { event: AccountValidatedEvent, handlers: [new AccountValidatedHandler()] },
  ],
});

/** Seeds the admin account at startup. Runs the command directly, on behalf of the system. */
export const registerAdmin = ({ email, password }: { email: string; password: string }) =>
  new RegisterAdminCommandHandler(accountRepository, accountRegistration, passwordHasher).execute(
    RegisterAdminCommandEvent.set({ email, password }),
    new ExecutionContext({
      traceId: v4(),
      eventBus: inMemoryEventBus,
      auth: { subjectId: 'system', role: Role.ADMIN },
    }),
  );
