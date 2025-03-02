import { GetOperationsHandler } from '@Contexts/Operations/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Operations/Application/Queries/GetOperation';

import { InMemoryOperationQueries } from '@Contexts/Operations/Infrastructure/Queries/InMemoryOperationQueries';
import { OperationsModule } from '@Contexts/Operations/Application';
import { IOperation } from '@Contexts/Operations/Domain/Operation';

import { InMemoryEventBus } from '@Contexts/Operations/Infrastructure/Services/InMemoryEventBus';

import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';

const inMemoryOperationDataSource = new InMemoryDataSource<IOperation>();
const inMemoryOperationQueries = new InMemoryOperationQueries(inMemoryOperationDataSource);

import { InMemoryOperationRepository } from '@Contexts/Operations/Infrastructure/Repositories/InMemoryOperationRepository';
const inMemoryOperationRepository = new InMemoryOperationRepository(inMemoryOperationDataSource);

export const localOperationManagerModule = new OperationsModule({
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
