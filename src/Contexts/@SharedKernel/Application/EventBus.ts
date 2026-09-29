/**
 * EventBus: publishes events and routes them to the handlers subscribed to their name.
 *
 * Publishing returns an Operation: a handle on the asynchronous processing of that event,
 * which the Tracker context records so a client can poll `GET /v1/tracker/operations/:id`.
 *
 * Implementations: Infrastructure/EventBus/InMemoryEventBus.ts (plain in-process emitter)
 * and Contexts/Tracker/Infrastructure/TrackedEventBus.ts (a decorator that records every operation).
 */

import { Event } from '@SharedKernel/Domain';
import { EventHandler } from '@SharedKernel/Application/EventHandler';
import { ExecutionContext } from '@SharedKernel/Application/ExecutionContext';
import { IOperation } from '@SharedKernel/Application/Operation';

export interface EventBus {
  /**
   * Connects to the event infrastructure (if needed)
   */
  connect(): Promise<void>;

  /**
   * Publishes an event to the event bus
   * @param event The event to dispatch
   * @param context The execution context of the caller, carried to the handlers
   * @returns The operation tracking the event
   */
  publish<T>(event: Event<T>, context: ExecutionContext): IOperation<Event<T>>;

  /**
   * Subscribes to an event
   * @param event The event name to subscribe to
   * @param eventHandler The handler for the event
   */
  subscribe<T>(event: Event<T>['name'], eventHandler: EventHandler<Event<T>>): Promise<void>;
}
