import { GetOperationsHandler } from '@Contexts/OperationsManager/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/OperationsManager/Application/Queries/GetOperation';

import { InMemoryOperationQueries } from '@Contexts/OperationsManager/Infrastructure/Queries/InMemoryOperationQueries';
import { OperationsManagerModule } from '@Contexts/OperationsManager/Application';
import { IOperation } from '@Contexts/OperationsManager/Domain/Operation';

import { InMemoryEventBus } from '@Contexts/OperationsManager/Infrastructure/Services/InMemoryEventBus';

import { InMemoryDataSource } from '@Shared/Infrastructure/DataSources/InMemoryDataSource';

const inMemoryOperationDataSource = new InMemoryDataSource<IOperation>();
const inMemoryOperationQueries = new InMemoryOperationQueries(inMemoryOperationDataSource);

import { InMemoryOperationRepository } from '@Contexts/OperationsManager/Infrastructure/Repositories/InMemoryOperationRepository';
const inMemoryOperationRepository = new InMemoryOperationRepository(inMemoryOperationDataSource);

export const localOperationManagerModule = new OperationsManagerModule({
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
  services: {
    eventBus: new InMemoryEventBus(inMemoryOperationRepository),
  },
});
