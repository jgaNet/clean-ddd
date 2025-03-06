import { GetOperationsHandler } from '@Contexts/Operations/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Operations/Application/Queries/GetOperation';

import { InMemoryOperationQueries } from '@Contexts/Operations/Infrastructure/Queries/InMemoryTrakedOperationQueries';
import { ITrackedOperation } from '@Contexts/Operations/Domain/TrackedOperation';
import { OperationsModule } from '@Contexts/Operations/Application';

import { TrakedEventBus } from '@Contexts/Operations/Infrastructure/Services/TrakedEventBus';

import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryOperationRepository } from '@Contexts/Operations/Infrastructure/Repositories/InMemoryTrakedOperationRepository';
import { ModuleBuilder } from '@Primitives/Module';

import { inMemoryEventEmitter } from '@SharedKernel/Infrastructure/EventEmitter/inMemoryEventEmitter';

const inMemoryOperationDataSource = new InMemoryDataSource<ITrackedOperation>();
const inMemoryOperationQueries = new InMemoryOperationQueries(inMemoryOperationDataSource);
const inMemoryOperationRepository = new InMemoryOperationRepository(inMemoryOperationDataSource);
const trakedEventBus = new TrakedEventBus({
  operationRepository: inMemoryOperationRepository,
  eventEmitter: inMemoryEventEmitter,
});
const getOperationsHandler = new GetOperationsHandler(inMemoryOperationQueries);
const getOperationHandler = new GetOperationHandler(inMemoryOperationQueries);

export const localOperationsModule = new ModuleBuilder<OperationsModule>(Symbol('operations'))
  .setQuery(getOperationsHandler)
  .setQuery(getOperationHandler)
  .setService('trakedEventBus', trakedEventBus)
  .build();
