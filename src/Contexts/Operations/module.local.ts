import { GetOperationsHandler } from '@Contexts/Operations/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Operations/Application/Queries/GetOperation';

import { InMemoryOperationQueries } from '@Contexts/Operations/Infrastructure/Queries/InMemoryOperationQueries';
import { IOperation } from '@Contexts/Operations/Domain/Operation';
import { OperationsModule } from '@Contexts/Operations/Application';

import { OperatedEventBus } from '@Contexts/Operations/Infrastructure/Services/OperatedEventBus';

import { InMemoryDataSource } from '@SharedKernel/Infrastructure/DataSources/InMemoryDataSource';
import { InMemoryOperationRepository } from '@Contexts/Operations/Infrastructure/Repositories/InMemoryOperationRepository';
import { ModuleBuilder } from '@Primitives/Module';

import { inMemoryEventEmitter } from '@SharedKernel/Infrastructure/EventEmitter/InMemoryEventEmitter';

const inMemoryOperationDataSource = new InMemoryDataSource<IOperation>();
const inMemoryOperationQueries = new InMemoryOperationQueries(inMemoryOperationDataSource);
const inMemoryOperationRepository = new InMemoryOperationRepository(inMemoryOperationDataSource);
const operatedEventBus = new OperatedEventBus({
  operationRepository: inMemoryOperationRepository,
  eventEmitter: inMemoryEventEmitter,
});
const getOperationsHandler = new GetOperationsHandler(inMemoryOperationQueries);
const getOperationHandler = new GetOperationHandler(inMemoryOperationQueries);

export const localOperationsModule = new ModuleBuilder<OperationsModule>(Symbol('operations'))
  .setEventBus(operatedEventBus)
  .setQuery(getOperationsHandler)
  .setQuery(getOperationHandler)
  .build();
