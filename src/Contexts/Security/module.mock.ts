import { ExecutionContext, ModuleBuilder, Role } from '@SharedKernel/Domain';

import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { SETTINGS } from '@Bootstrap/Fastify/application.settings';

// Account
import { Account } from './Domain/Account/Account';
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

import { MockedAccountRepository } from './Infrastructure/Repositories/MockedAccountRepository';
import { MockedAccountQueries } from './Infrastructure/Queries/MockedAccountQueries';
// Create shared infrastructure
const accountDataSource = new InMemoryDataSource<Account>();

// Create repositories and queries
export const mockAccountRepository = new MockedAccountRepository(accountDataSource);
export const mockAccountQueries = new MockedAccountQueries(accountDataSource);

// Create services with injected configuration
const jwtService = new JwtService({
  secret: SETTINGS.security.jwt.secret,
  expiresIn: SETTINGS.security.jwt.expiresIn,
});

const authMiddleware = new AuthenticationMiddleware(mockAccountQueries);

// Build the security module
export const mockSecurityModule = new ModuleBuilder<SecurityModule>(Symbol('Security'))
  .setCommand({
    event: SignUpCommandEvent,
    handlers: [new SignUpCommandHandler(mockAccountRepository)],
  })
  .setCommand({
    event: LoginCommandEvent,
    handlers: [new LoginCommandHandler(mockAccountRepository, jwtService)],
  })
  .setCommand({
    event: ValidateAccountCommandEvent,
    handlers: [new ValidateAccountCommandHandler(mockAccountRepository)],
  })
  .setDomainEvent({ event: AccountCreatedEvent, handlers: [new AccountCreatedHandler(jwtService)] })
  .setDomainEvent({ event: AccountValidatedEvent, handlers: [new AccountValidatedHandler()] })
  .setQuery(new GetAccountQueryHandler(mockAccountQueries))
  .setService('jwtService', jwtService)
  .setService('authMiddleware', authMiddleware)
  .setService('admin', {
    register: ({ identifier, password }: { identifier: string; password: string }) =>
      new RegisterAdminCommandHandler(mockAccountRepository).execute(
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
