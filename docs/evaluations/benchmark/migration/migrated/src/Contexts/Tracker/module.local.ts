import { Module } from '@Architecture/Application';
import { InMemoryDataSource } from '@Architecture/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryEventBus } from '@Architecture/Infrastructure/EventBus/InMemoryEventBus';
import { EventEmitter } from 'events';

import { OperationRecord } from '@Contexts/Tracker/Application/ReadModel/OperationRecord';
import { GetOperationQueryHandler, GetOperationsQueryHandler } from '@Contexts/Tracker/Application/Queries';
import { InMemoryOperationRecords } from '@Contexts/Tracker/Infrastructure/InMemoryOperationRecords';
import { TrackedEventBus } from '@Contexts/Tracker/Infrastructure/TrackedEventBus';

const operationRecords = new InMemoryOperationRecords(new InMemoryDataSource<OperationRecord>());

// The application's event bus: the in-memory bus, decorated so that every operation is recorded.
export const trackedEventBus = new TrackedEventBus(
  new InMemoryEventBus({ eventEmitter: new EventEmitter() }),
  operationRecords,
);

export const localTrackerModule = new Module({
  name: 'Tracker',
  queries: [new GetOperationsQueryHandler(operationRecords), new GetOperationQueryHandler(operationRecords)],
});
