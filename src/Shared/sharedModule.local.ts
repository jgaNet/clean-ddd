import { GetOperationsHandler } from '@Shared/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Shared/Application/Queries/GetOperation';

import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryOperationQueries } from '@Shared/Infrastructure/Queries/InMemoryOperationQueries';
import { InMemoryOperationRepository } from '@Shared/Infrastructure/Repositories/InMemoryOperationRepository';
import { InMemoryEventBus } from '@Shared/Infrastructure/EventBus/InMemoryEventBus';
import { SharedModule } from '@Shared/Application';
import { IOperation } from 'Shared/Domain/Operation';

const inMemoryOperationDataSource = new InMemoryDataSource<IOperation>();
const inMemoryOperationQueries = new InMemoryOperationQueries(inMemoryOperationDataSource);
const inMemoryOperationRepository = new InMemoryOperationRepository(inMemoryOperationDataSource);
const eventBus = new InMemoryEventBus(inMemoryOperationRepository);

export const localSharedModule = new SharedModule({
  eventBus,
  commands: [],
  queries: [
    {
      name: GetOperationsHandler.name,
      handler: new GetOperationsHandler(inMemoryOperationQueries),
    },
    {
      name: GetOperationHandler.name,
      handler: new GetOperationHandler(inMemoryOperationQueries),
    },
  ],
  domainEvents: [],
  integrationEvents: [],
});
