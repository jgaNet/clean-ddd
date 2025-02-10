import { Exception } from '@Primitives/Exception';
import { ExceptionEvent } from '@Primitives/EventTypes';

export abstract class ExceptionHandler {
  abstract throw(event: typeof ExceptionEvent<Exception>, error: Exception): Promise<void>;
  unknown(error: unknown): void {
    throw error;
  }
}
