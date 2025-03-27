import { Module } from '@SharedKernel/Domain/Application';
import {
  NotificationsModuleCommands,
  NotificationsModuleDomainEvents,
  NotificationsModuleQueries,
  NotificationsModuleIntegrationEvents,
  NotificationsModuleServices,
} from './DTOs';

export class NotificationsModule extends Module<
  NotificationsModuleCommands,
  NotificationsModuleQueries,
  NotificationsModuleDomainEvents,
  NotificationsModuleIntegrationEvents,
  NotificationsModuleServices
> {}