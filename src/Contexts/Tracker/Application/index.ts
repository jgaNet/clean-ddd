import { Module } from '@SharedKernel/Domain/Application';
import {
  TrackerModuleCommands,
  TrackerModuleDomainEvents,
  TrackerModuleQueries,
  TrackerModuleIntegrationEvents,
  TrackerModuleServices,
} from './DTOs';
export class TrackerModule extends Module<
  TrackerModuleCommands,
  TrackerModuleQueries,
  TrackerModuleDomainEvents,
  TrackerModuleIntegrationEvents,
  TrackerModuleServices
> {}
