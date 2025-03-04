import { Result } from './Result';

/**
 * Represents a step in a saga with an execution action and compensation action.
 * 
 * @template T The result type of the execution action
 * @property execute Function that performs the main action and returns a Result
 * @property compensate Function that undoes the action if needed
 */
export interface SagaStep<T> {
  execute: () => Promise<Result<T>>;
  compensate: () => Promise<void>;
}

/**
 * Saga orchestrator that manages a sequence of steps with compensation
 * for handling distributed transactions.
 * 
 * Key characteristics:
 * - Implements the Saga pattern for distributed transactions
 * - Provides automatic compensation (rollback) if any step fails
 * - Executes compensating actions in reverse order
 * - Maintains transactional consistency across multiple operations
 * 
 * Usage example:
 * ```typescript
 * const orderSaga = new Saga()
 *   .addStep({
 *     execute: () => createOrder(orderData),
 *     compensate: () => cancelOrder(orderId)
 *   })
 *   .addStep({
 *     execute: () => processPayment(paymentData),
 *     compensate: () => refundPayment(paymentId)
 *   });
 * 
 * const result = await orderSaga.execute();
 * if (result.isFailure()) {
 *   // Handle failure - compensation has already been applied
 * }
 * ```
 * 
 * Related components:
 * - {@link Result} - Used to indicate success/failure of operations
 * - {@link CommandHandler} - Often used with Sagas for complex operations
 */
export class Saga {
  private steps: SagaStep<any>[] = [];
  private executedSteps: SagaStep<any>[] = [];

  /**
   * Add a step to the saga sequence.
   * 
   * @template T The result type of the step's execution
   * @param step The saga step to add with execute and compensate functions
   * @returns The saga instance for method chaining
   */
  addStep<T>(step: SagaStep<T>): Saga {
    this.steps.push(step);
    return this;
  }

  /**
   * Execute all steps in the saga sequentially.
   * If any step fails, execute compensation actions for all previously executed steps.
   * 
   * @returns A Result indicating success or failure of the entire saga
   */
  async execute(): Promise<Result<void>> {
    for (const step of this.steps) {
      const result = await step.execute();
      
      if (result.isFailure()) {
        // If a step fails, compensate all previously executed steps in reverse order
        await this.compensate();
        return Result.fail(result.error);
      }
      
      this.executedSteps.push(step);
    }
    
    return Result.ok();
  }

  /**
   * Execute compensation actions for all executed steps in reverse order.
   * This provides a rollback mechanism if the saga fails.
   * 
   * @private
   */
  private async compensate(): Promise<void> {
    for (const step of [...this.executedSteps].reverse()) {
      await step.compensate();
    }
    
    // Clear executed steps after compensation
    this.executedSteps = [];
  }
}