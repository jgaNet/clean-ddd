import { Module } from '@Primitives/Module';
import {
  UsersManagerModuleCommands,
  UsersManagerModuleDomainEvents,
  UsersManagerModuleQueries,
  UsersManagerModuleIntegrationEvents,
} from './DTOs';
export class UsersManagerModule extends Module<
  UsersManagerModuleCommands,
  UsersManagerModuleQueries,
  UsersManagerModuleDomainEvents,
  UsersManagerModuleIntegrationEvents
> {}
