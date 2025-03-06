import { ITrackedOperation } from '@Contexts/Operations/Domain/TrackedOperation';
import { IResult } from '@Primitives';
import { GetOperationsHandler } from '@Contexts/Operations/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Operations/Application/Queries/GetOperation';
import { TrakedEventBus } from '@Contexts/Operations/Infrastructure/Services/OperatedEventBus';

export type GetOperationsQueryResult = IResult<ITrackedOperation[]>;
export type GetOperationQueryResult = IResult<ITrackedOperation>;
export type GetOperationQueryPayload = { id: string };
export type OperationsModuleCommands = [];
export type OperationsModuleQueries = [
  { name: typeof GetOperationsHandler.name; handler: GetOperationsHandler },
  { name: typeof GetOperationHandler.name; handler: GetOperationHandler },
];
export type OperationsModuleDomainEvents = [];
export type OperationsModuleIntegrationEvents = [];
export type OperationsModuleServices = {
  trakedEventBus: TrakedEventBus;
};
