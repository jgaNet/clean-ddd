/**
 * CommandHandler is a core primitive that represents the application's command handling infrastructure.
 *
 * This abstract class serves as a base for all command handlers in the application, following
 * the Command Pattern and CQRS (Command Query Responsibility Segregation) principles.
 *
 * Key characteristics:
 * - Extends EventHandler to handle command events
 * - Generic type T extends Event<unknown> to ensure type safety for command payloads
 * - Requires implementation of an execute method that processes the command and returns a Result
 * - Follows the Single Responsibility Principle by handling one specific command type
 *
 * Usage example:
 * ```typescript
 * // 1. Define a command event
 * export class CreateUserCommand extends CommandEvent<{
 *   email: string;
 *   name: string;
 * }> {
 *   static readonly TYPE = 'User.CreateUser';
 *   constructor(payload: {email: string; name: string}) {
 *     super(CreateUserCommand.TYPE, payload);
 *   }
 * }
 *
 * // 2. Implement a command handler
 * export class CreateUserCommandHandler extends CommandHandler<CreateUserCommand> {
 *   constructor(private userRepository: IUserRepository) {
 *     super();
 *   }
 *
 *   async execute(command: CreateUserCommand, eventBus: EventBus): Promise<Result<string>> {
 *     const user = User.create({
 *       email: command.payload.email,
 *       name: command.payload.name
 *     });
 *
 *     await this.userRepository.save(user);
 *
 *     // Emit domain event
 *     await eventBus.publish(new UserCreatedEvent({
 *       userId: user.id,
 *       email: user.email.value
 *     }));
 *
 *     return Result.ok(user.id);
 *   }
 * }
 *
 * // 3. Register with module
 * const module = new ModuleBuilder('Users')
 *   .setCommand({
 *     event: CreateUserCommand,
 *     handlers: [new CreateUserCommandHandler(userRepository)]
 *   })
 *   .build();
 * ```
 *
 * Related components:
 * - {@link CommandEvent} - Event types for commands
 * - {@link Result} - Encapsulates success/failure outcomes
 * - {@link Module} - Registers and resolves command handlers
 * - {@link Operation} - Tracks command execution state
 * - {@link EventBus} - Publishes domain events after command execution
 */

import { EventHandler } from './EventHandler';
import { CommandEvent, IResult, IEvent, IOperation } from '@Primitives';
import { ExecutionContext } from './ExecutionContext';

/**
 * Abstract base class for all command handlers in the application.
 *
 * @template T The specific CommandEvent type this handler processes
 */
export abstract class CommandHandler<T extends CommandEvent<unknown>> extends EventHandler<T> {
  /**
   * Handles the command operation by executing the command and updating the operation state.
   *
   * This method:
   * 1. Creates an execution context from the operation
   * 2. Executes the command using the abstract execute method
   * 3. Updates the operation's status based on the result
   * 4. Returns the updated operation
   *
   * @param operation The operation containing the command event to handle
   * @returns A promise resolving to the updated operation
   */
  async handle(operation: IOperation<T>): Promise<IOperation<T>> {
    // Create execution context from operation
    // const context = new ExecutionContext({
    //   traceId: operation.id,
    //   eventBus: operation.context.eventBus,
    //   // Add any other context properties available in operation
    // });

    // Execute with context
    const result = await this.execute(operation.event, operation.context);

    if (result.isFailure()) {
      return operation.failed(result.error);
    }

    return operation.success(result.data);
  }

  /**
   * Abstract method that must be implemented by concrete command handlers.
   * Contains the actual business logic for processing the command.
   *
   * @param event The command event to execute
   * @param context The execution context with event bus, unit of work, and other services
   * @returns A promise resolving to the result of the command execution
   */
  abstract execute(event: IEvent<unknown>, context: ExecutionContext): Promise<IResult<unknown>>;
}
