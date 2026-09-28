import { Module } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { inMemoryEventEmitter } from '@SharedKernel/Infrastructure/EventEmitter/inMemoryEventEmitter';

import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import { GetOperationsHandler } from '@Contexts/Tracker/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Tracker/Application/Queries/GetOperation';
import { InMemoryOperationQueries } from '@Contexts/Tracker/Infrastructure/Queries/InMemoryTrakedOperationQueries';
import { InMemoryOperationRepository } from '@Contexts/Tracker/Infrastructure/Repositories/InMemoryTrakedOperationRepository';
import { TrakedEventBus } from '@Contexts/Tracker/Infrastructure/Services/TrakedEventBus';

const operationDataSource = new InMemoryDataSource<ITrackedOperation>();
const operationQueries = new InMemoryOperationQueries(operationDataSource);
const operationRepository = new InMemoryOperationRepository(operationDataSource);

// The application's event bus: an in-memory bus that records every operation it carries.
export const trackedEventBus = new TrakedEventBus({
  operationRepository,
  eventEmitter: inMemoryEventEmitter,
});

export const localTrackerModule = new Module({
  name: 'Tracker',
  queries: [new GetOperationsHandler(operationQueries), new GetOperationHandler(operationQueries)],
});
