import { Exception } from '@SharedKernel/Domain/DDD';

export class NoteDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'notes', type, message, context });
  }
}

export class BlankNoteException extends NoteDomainException {
  constructor(message: string, context?: unknown) {
    super({ type: 'BlankNote', message, context });
  }
}
