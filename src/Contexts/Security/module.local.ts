import { Role } from '@SharedKernel/Domain';
import { ExecutionContext, Module } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { inMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';
import { SETTINGS } from '@Bootstrap/Fastify/application.settings';
import { v4 } from 'uuid';

import { IAccount } from './Domain/Account/DTOs';
import { AccountRegistration } from './Domain/Account/AccountRegistration';
import { AccountCreatedEvent, AccountValidatedEvent } from './Domain/Account/Events/AccountEvents';
import { SignUpCommandEvent } from './Application/Commands/SignUp/SignUpCommandEvent';
import { SignUpCommandHandler } from './Application/Commands/SignUp/SignUpCommandHandler';
import { LoginCommandEvent } from './Application/Commands/Login/LoginCommandEvent';
import { LoginCommandHandler } from './Application/Commands/Login/LoginCommandHandler';
import { ValidateAccountCommandEvent } from './Application/Commands/ValidateAccount/ValidateAccountCommandEvent';
import { ValidateAccountCommandHandler } from './Application/Commands/ValidateAccount/ValidateAccountCommandHandler';
import { RegisterAdminCommandEvent } from './Application/Commands/AddAdmin/RegisterAdminCommandEvent';
import { RegisterAdminCommandHandler } from './Application/Commands/AddAdmin/RegisterAdminCommandHandler';
import { GetAccountQueryHandler } from './Application/Queries/GetAccount/GetAccountQueryHandler';
import { AccountCreatedHandler } from './Application/Events/AccountCreatedHandler';
import { AccountValidatedHandler } from './Application/Events/AccountValidatedHandler';
import { InMemoryAccountRepository } from './Infrastructure/Repositories/InMemoryAccountRepository';
import { InMemoryAccountQueries } from './Infrastructure/Queries/InMemoryAccountQueries';
import { JwtService } from './Infrastructure/Services/JwtService';
import { BcryptPasswordHasher } from './Infrastructure/Services/BcryptPasswordHasher';
import { AuthenticationMiddleware } from './Presentation/API/REST/Middlewares/FastifyJWTAuthenticationMiddleware';

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
