import { IOperation } from '@Contexts/Operations/Domain/Operation';
import { IResult } from '@Primitives';
import { GetOperationsHandler } from '@Contexts/Operations/Application/Queries/GetOperations';
import { GetOperationHandler } from '@Contexts/Operations/Application/Queries/GetOperation';

export type GetOperationsQueryResult = IResult<IOperation[]>;
export type GetOperationQueryResult = IResult<IOperation>;
export type GetOperationQueryPayload = { id: string };
export type OperationsModuleCommands = [];
export type OperationsModuleQueries = [
  { name: typeof GetOperationsHandler.name; handler: GetOperationsHandler },
  { name: typeof GetOperationHandler.name; handler: GetOperationHandler },
];
export type OperationsModuleDomainEvents = [];
export type OperationsModuleIntegrationEvents = [];
export type OperationsModuleServices = Record<string, never>;
