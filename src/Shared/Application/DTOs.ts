import { IOperation } from '@Shared/Domain/Operation';
import { ResultValue } from '@Primitives';
import { GetOperationsHandler } from './Queries/GetOperations';
import { GetOperationHandler } from './Queries/GetOperation';

export type GetOperationsQueryResult = ResultValue<IOperation[]>;
export type GetOperationQueryResult = ResultValue<IOperation>;
export type GetOperationQueryPayload = { id: string };
export type SharedModuleCommands = [];
export type SharedModuleQueries = [
  { name: typeof GetOperationsHandler.name; handler: GetOperationsHandler },
  { name: typeof GetOperationHandler.name; handler: GetOperationHandler },
];
export type SharedModuleDomainEvents = [];
export type SharedModuleIntegrationEvents = [];
