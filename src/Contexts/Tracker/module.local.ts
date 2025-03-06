import { GetOperationsHandler } from '@Contexts/Tracker/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Tracker/Application/Queries/GetOperation';

import { InMemoryOperationQueries } from '@Contexts/Tracker/Infrastructure/Queries/InMemoryTrakedOperationQueries';
import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import { TrackerModule } from '@Contexts/Tracker/Application';

import { TrakedEventBus } from '@Contexts/Tracker/Infrastructure/Services/TrakedEventBus';

import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryOperationRepository } from '@Contexts/Tracker/Infrastructure/Repositories/InMemoryTrakedOperationRepository';
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

export const localTrackerModule = new ModuleBuilder<TrackerModule>(Symbol('Tracker'))
  .setQuery(getOperationsHandler)
  .setQuery(getOperationHandler)
  .setService('eventBus', trakedEventBus)
  .build();
