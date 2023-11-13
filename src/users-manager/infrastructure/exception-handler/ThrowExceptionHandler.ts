import { Exception } from '@primitives/Exception';
import { ExceptionHandler } from '@primitives/ExceptionHandler';

export class ThrowExceptionHandler extends ExceptionHandler {
  throw(_: unknown, error: Exception): Promise<void> {
    throw error;
  }
}
