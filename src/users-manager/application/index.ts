import { Module } from '@primitives/Module';
import {
  UsersManagerModuleCommands,
  UsersManagerModuleDomainEvents,
  UsersManagerModuleQueries,
  UsersManagerModuleIntegrationEvents,
} from './dtos';
export class UsersManagerModule extends Module<
  UsersManagerModuleCommands,
  UsersManagerModuleQueries,
  UsersManagerModuleDomainEvents,
  UsersManagerModuleIntegrationEvents
> {}
