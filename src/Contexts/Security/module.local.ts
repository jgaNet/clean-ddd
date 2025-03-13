import { ExecutionContext, ModuleBuilder, Role } from '@SharedKernel/Domain';

import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { SETTINGS } from '@Bootstrap/Fastify/application.settings';

// Account
import { Account } from './Domain/Account/Account';
import { InMemoryAccountRepository } from './Infrastructure/Repositories/InMemoryAccountRepository';
import { InMemoryAccountQueries } from './Infrastructure/Queries/InMemoryAccountQueries';
import { SignUpCommandEvent } from './Application/Commands/SignUp/SignUpCommandEvent';
import { SignUpCommandHandler } from './Application/Commands/SignUp/SignUpCommandHandler';
import { GetAccountQueryHandler } from './Application/Queries/GetAccount/GetAccountQueryHandler';
import { AuthenticationMiddleware } from './Presentation/API/REST/Middlewares/FastifyJWTAuthenticationMiddleware';
import { inMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';

// Login
import { LoginCommandEvent } from './Application/Commands/Login/LoginCommandEvent';
import { LoginCommandHandler } from './Application/Commands/Login/LoginCommandHandler';
import { JwtService } from './Infrastructure/Services/JwtService';
import { SecurityModule } from './Application';
import { AccountCreatedEvent } from './Domain/Account/Events/AccountCreatedEvent';
import { AccountCreatedHandler } from './Application/Events/AccountCreatedHandler';
import { AccountValidatedHandler } from './Application/Events/AccountValidatedHandler';
import { AccountValidatedEvent } from './Domain/Account/Events/AccountValidatedEvent';
import { ValidateAccountCommandEvent } from './Application/Commands/ValidateAccount/ValidateAccountCommandEvent';
import { ValidateAccountCommandHandler } from './Application/Commands/ValidateAccount/ValidateAccountCommandHandler';
import { RegisterAdminCommandHandler } from './Application/Commands/AddAdmin/RegisterAdminCommandHandler';
import { RegisterAdminCommandEvent } from './Application/Commands/AddAdmin/RegisterAdminCommandEvent';
import { v4 } from 'uuid';

// Create shared infrastructure
const accountDataSource = new InMemoryDataSource<Account>();

// Create repositories and queries
const accountRepository = new InMemoryAccountRepository(accountDataSource);
const accountQueries = new InMemoryAccountQueries(accountDataSource);

// Create services with injected configuration
const jwtService = new JwtService({
  secret: SETTINGS.security.jwt.secret,
  expiresIn: SETTINGS.security.jwt.expiresIn,
});

const authMiddleware = new AuthenticationMiddleware(accountQueries);

// Build the security module
export const localSecurityModule = new ModuleBuilder<SecurityModule>(Symbol('Security'))
  .setCommand({
    event: SignUpCommandEvent,
    handlers: [new SignUpCommandHandler(accountRepository)],
  })
  .setCommand({
    event: LoginCommandEvent,
    handlers: [new LoginCommandHandler(accountQueries, accountRepository, jwtService)],
  })
  .setCommand({
    event: ValidateAccountCommandEvent,
    handlers: [new ValidateAccountCommandHandler(accountRepository)],
  })
  .setDomainEvent({ event: AccountCreatedEvent, handlers: [new AccountCreatedHandler(jwtService)] })
  .setDomainEvent({ event: AccountValidatedEvent, handlers: [new AccountValidatedHandler()] })
  .setQuery(new GetAccountQueryHandler(accountQueries))
  .setService('jwtService', jwtService)
  .setService('authMiddleware', authMiddleware)
  .setService('admin', {
    register: ({ identifier, password }: { identifier: string; password: string }) =>
      new RegisterAdminCommandHandler(accountRepository).execute(
        RegisterAdminCommandEvent.set({ identifier, password }),
        new ExecutionContext({
          traceId: v4(),
          eventBus: inMemoryEventBus,
          auth: {
            subjectId: 'system',
            role: Role.ADMIN,
          },
        }),
      ),
  })
  .build();
