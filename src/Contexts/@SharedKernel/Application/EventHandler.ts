/**
 * EventHandler: reacts to an event. It is the base of every listener in the application
 * layer, and the parent of CommandHandler.
 *
 * A domain event handler stays inside its context and typically logs, updates a read model
 * or publishes an integration event for other contexts:
 * Contexts/Notes/Application/Events/NoteSharedHandler.ts
 *
 * An integration event handler lives in the receiving context and translates the foreign
 * event into a local command or service call:
 * Contexts/Notifications/Application/Events/NoteSharedIntegrationEventHandler.ts
 */

import { Event, IResult } from '@SharedKernel/Domain';
import { ExecutionContext } from '@SharedKernel/Application/ExecutionContext';
import { IOperation } from '@SharedKernel/Application/Operation';

/**
 * Abstract base class for all event handlers in the application.
 *
 * @template T The specific Event type this handler processes
 */
export abstract class EventHandler<T extends Event<unknown>> {
  /**
   * Handles an event operation by executing the event handler logic and
   * updating the operation state.
   *
   * This method:
   * 1. Executes the event using the abstract execute method
   * 2. Marks the operation as sent
   * 3. Returns the updated operation
   *
   * @param operation The operation containing the event to handle
   * @returns A promise resolving to the updated operation
   */
  async handle(operation: IOperation<T>): Promise<IOperation<T>> {
    this.execute(operation.event, operation.context);
    return operation.sent();
  }

  /**
   * Abstract method that must be implemented by concrete event handlers.
   * Contains the actual business logic for processing the event.
   *
   * @param payload The event to execute
   * @param eventBus The event bus for publishing additional events
   * @returns A promise resolving to the result of the event execution
   */
  abstract execute(payload: T, context: ExecutionContext): Promise<IResult<unknown>>;
}
