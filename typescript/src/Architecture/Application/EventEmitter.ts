import { IEvent } from '@Architecture/Domain';
import { IOperation } from '@Architecture/Application/Operation';

/** What travels on the emitter: an operation, whose event is the one the channel is named after. */
export type EmittedOperation = IOperation<IEvent<unknown>>;

/** The emitter the InMemoryEventBus is built on: the subset of Node's EventEmitter it uses. */
export interface IEventEmitter {
  emit(event: string, operation: EmittedOperation): boolean;
  addListener(event: string, listener: (operation: EmittedOperation) => void): this;
}
