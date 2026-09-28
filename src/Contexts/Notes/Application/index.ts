import { Module } from '@SharedKernel/Application';
import {
  NotesModuleCommands,
  NotesModuleDomainEvents,
  NotesModuleQueries,
  NotesModuleIntegrationEvents,
  NotesModuleServices,
} from './DTOs';
export class NotesModule extends Module<
  NotesModuleCommands,
  NotesModuleQueries,
  NotesModuleDomainEvents,
  NotesModuleIntegrationEvents,
  NotesModuleServices
> {}
