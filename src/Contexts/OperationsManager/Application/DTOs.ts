import { IOperation } from '@Contexts/OperationsManager/Domain/Operation';
import { IResult } from '@Primitives';
import { GetOperationsHandler } from '@Contexts/OperationsManager/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/OperationsManager/Application/Queries/GetOperation';
import { InMemoryEventBus } from '@Contexts/OperationsManager/Infrastructure/Services/InMemoryEventBus';

export type GetOperationsQueryResult = IResult<IOperation[]>;
export type GetOperationQueryResult = IResult<IOperation>;
export type GetOperationQueryPayload = { id: string };
export type OperationsManagerModuleCommands = [];
export type OperationsManagerModuleQueries = [
  { name: typeof GetOperationsHandler.name; handler: GetOperationsHandler },
  { name: typeof GetOperationHandler.name; handler: GetOperationHandler },
];
export type OperationsManagerModuleDomainEvents = [];
export type OperationsManagerModuleIntegrationEvents = [];
export type OperationsManagerModuleServices = {
  eventBus: InMemoryEventBus;
};
