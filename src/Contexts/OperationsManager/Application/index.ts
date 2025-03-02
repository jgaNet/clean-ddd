import { Module } from '@Primitives';
import {
  OperationsManagerModuleCommands,
  OperationsManagerModuleDomainEvents,
  OperationsManagerModuleQueries,
  OperationsManagerModuleIntegrationEvents,
  OperationsManagerModuleServices,
} from './DTOs';
export class OperationsManagerModule extends Module<
  OperationsManagerModuleCommands,
  OperationsManagerModuleQueries,
  OperationsManagerModuleDomainEvents,
  OperationsManagerModuleIntegrationEvents,
  OperationsManagerModuleServices
> {}
