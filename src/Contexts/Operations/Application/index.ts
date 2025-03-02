import { Module } from '@Primitives';
import {
  OperationsModuleCommands,
  OperationsModuleDomainEvents,
  OperationsModuleQueries,
  OperationsModuleIntegrationEvents,
  OperationsModuleServices,
} from './DTOs';
export class OperationsModule extends Module<
  OperationsModuleCommands,
  OperationsModuleQueries,
  OperationsModuleDomainEvents,
  OperationsModuleIntegrationEvents,
  OperationsModuleServices
> {}
