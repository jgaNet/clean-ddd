import { ModuleBuilder } from '@Primitives';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

// Auth
import { Auth } from './Domain/Auth/Auth';
import { InMemoryAuthRepository } from './Infrastructure/Repositories/InMemoryAuthRepository';
import { InMemoryAuthQueries } from './Infrastructure/Queries/InMemoryAuthQueries';
import { CreateAuthCommandEvent } from './Application/Commands/CreateAuth/CreateAuthCommandEvent';
import { CreateAuthCommandHandler } from './Application/Commands/CreateAuth/CreateAuthCommandHandler';
import { GetAuthQueryHandler } from './Application/Queries/GetAuth/GetAuthQueryHandler';

// Create shared infrastructure
const authDataSource = new InMemoryDataSource<Auth>();

// Create repositories and queries
const authRepository = new InMemoryAuthRepository(authDataSource);
const authQueries = new InMemoryAuthQueries(authDataSource);

// Build the security module
export const localSecurityModule = new ModuleBuilder(Symbol('Security'))
  .setCommand({
    event: CreateAuthCommandEvent,
    handlers: [new CreateAuthCommandHandler(authRepository)],
  })
  .setQuery(new GetAuthQueryHandler(authQueries))
  .build();
