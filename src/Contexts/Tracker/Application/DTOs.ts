import { IResult } from '@SharedKernel/Domain/Application';

import { ITrackedOperation } from '@Contexts/Tracker/Domain/TrackedOperation';
import { GetOperationsHandler } from '@Contexts/Tracker/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Tracker/Application/Queries/GetOperation';
import { TrakedEventBus } from '@Contexts/Tracker/Infrastructure/Services/TrakedEventBus';

export type GetOperationsQueryResult = IResult<ITrackedOperation[]>;
export type GetOperationQueryResult = IResult<ITrackedOperation>;
export type GetOperationQueryPayload = { id: string };
export type TrackerModuleCommands = [];
export type TrackerModuleQueries = [
  { name: typeof GetOperationsHandler.name; handler: GetOperationsHandler },
  { name: typeof GetOperationHandler.name; handler: GetOperationHandler },
];
export type TrackerModuleDomainEvents = [];
export type TrackerModuleIntegrationEvents = [];
export type TrackerModuleServices = {
  eventBus: TrakedEventBus;
};
