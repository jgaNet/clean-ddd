import { Module } from '@Primitives';
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
