import { Module } from '@SharedKernel/Domain/Application';
import {
  SecurityModuleCommands,
  SecurityModuleDomainEvents,
  SecurityModuleQueries,
  SecurityModuleIntegrationEvents,
  SecurityModuleServices,
} from './DTOs';
export class SecurityModule extends Module<
  SecurityModuleCommands,
  SecurityModuleQueries,
  SecurityModuleDomainEvents,
  SecurityModuleIntegrationEvents,
  SecurityModuleServices
> {}
