import { Exception } from './Exception';
import { ExceptionEvent } from './EventTypes';

export abstract class ExceptionHandler {
  abstract throw(event: typeof ExceptionEvent<Error>, error: Exception): Promise<void>;
  unknown(error: unknown): void {
    throw error;
  }
}
