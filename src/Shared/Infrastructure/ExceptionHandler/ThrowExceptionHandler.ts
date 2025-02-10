import { Exception } from '@Primitives/Exception';
import { ExceptionHandler } from '@Primitives/ExceptionHandler';

export class ThrowExceptionHandler extends ExceptionHandler {
  throw(_: unknown, error: Exception): Promise<void> {
    throw error;
  }
}
