import { Module } from '@SharedKernel/Domain/Application';
import {
  UsersModuleCommands,
  UsersModuleDomainEvents,
  UsersModuleQueries,
  UsersModuleIntegrationEvents,
  UsersModuleServices,
} from './DTOs';
export class UsersModule extends Module<
  UsersModuleCommands,
  UsersModuleQueries,
  UsersModuleDomainEvents,
  UsersModuleIntegrationEvents,
  UsersModuleServices
> {}
