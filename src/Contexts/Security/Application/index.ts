import { Module } from '@Core/Application';
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
