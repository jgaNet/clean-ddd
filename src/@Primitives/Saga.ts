import { Result } from './Result';

/**
 * Represents a step in a saga with compensation action
 */
export interface SagaStep<T> {
  execute: () => Promise<Result<T>>;
  compensate: () => Promise<void>;
}

/**
 * Saga orchestrator that manages a sequence of steps with compensation
 * for handling distributed transactions
 */
export class Saga {
  private steps: SagaStep<any>[] = [];
  private executedSteps: SagaStep<any>[] = [];

  /**
   * Add a step to the saga
   * @param step The saga step to add
   */
  addStep<T>(step: SagaStep<T>): Saga {
    this.steps.push(step);
    return this;
  }

  /**
   * Execute all steps in the saga sequentially
   * If any step fails, execute compensation actions for all previously executed steps
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
   * Execute compensation actions for all executed steps in reverse order
   */
  private async compensate(): Promise<void> {
    for (const step of [...this.executedSteps].reverse()) {
      await step.compensate();
    }
    
    // Clear executed steps after compensation
    this.executedSteps = [];
  }
}