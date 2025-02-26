import { Module } from '@Primitives';
import {
  SharedModuleCommands,
  SharedModuleDomainEvents,
  SharedModuleQueries,
  SharedModuleIntegrationEvents,
} from './DTOs';
export class SharedModule extends Module<
  SharedModuleCommands,
  SharedModuleQueries,
  SharedModuleDomainEvents,
  SharedModuleIntegrationEvents
> {}
