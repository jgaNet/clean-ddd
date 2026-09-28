import { Module } from '@SharedKernel/Application';
import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@SharedKernel/Infrastructure/EventBus/InMemoryEventBus';
import { inMemoryEventEmitter } from '@SharedKernel/Infrastructure/EventEmitter/inMemoryEventEmitter';

import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';
import { GetOperationsHandler } from '@Contexts/Tracker/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Tracker/Application/Queries/GetOperation';
import { InMemoryOperationRecords } from '@Contexts/Tracker/Infrastructure/InMemoryOperationRecords';
import { TrackedEventBus } from '@Contexts/Tracker/Infrastructure/TrackedEventBus';

const operationRecords = new InMemoryOperationRecords(new InMemoryDataSource<OperationRecord>());

// The application's event bus: the in-memory bus, decorated so that every operation is recorded.
export const trackedEventBus = new TrackedEventBus(
  new InMemoryEventBus({ eventEmitter: inMemoryEventEmitter }),
  operationRecords,
);

export const localTrackerModule = new Module({
  name: 'Tracker',
  queries: [new GetOperationsHandler(operationRecords), new GetOperationHandler(operationRecords)],
});
