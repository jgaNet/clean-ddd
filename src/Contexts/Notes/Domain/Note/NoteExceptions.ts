import { Exception } from '@SharedKernel/Domain';

/**
 * Domain exceptions describe a broken business rule, in business words.
 *
 * They are values carried by Result.fail(), never thrown: a refused command is a normal
 * outcome, not a crash. Each one names the rule it protects.
 */
export class NoteDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'notes', type, message, context });
  }
}

export class BlankNoteTitleException extends NoteDomainException {
  constructor() {
    super({ type: 'BlankNoteTitle', message: 'A note needs a title' });
  }
}

export class NoteTitleTooLongException extends NoteDomainException {
  constructor(maxLength: number, actualLength: number) {
    super({
      type: 'NoteTitleTooLong',
      message: `A note title cannot exceed ${maxLength} characters`,
      context: { maxLength, actualLength },
    });
  }
}

export class NoteNotFoundException extends NoteDomainException {
  constructor(noteId: string) {
    super({ type: 'NoteNotFound', message: 'Note not found', context: { noteId } });
  }
}

export class NotNoteOwnerException extends NoteDomainException {
  constructor(noteId: string, actorId: string) {
    super({
      type: 'NotNoteOwner',
      message: 'Only the owner of a note can change it',
      context: { noteId, actorId },
    });
  }
}

export class NoteArchivedException extends NoteDomainException {
  constructor(noteId: string) {
    super({
      type: 'NoteArchived',
      message: 'An archived note is read-only; restore it first',
      context: { noteId },
    });
  }
}

export class NoteAlreadyArchivedException extends NoteDomainException {
  constructor(noteId: string) {
    super({ type: 'NoteAlreadyArchived', message: 'This note is already archived', context: { noteId } });
  }
}

export class NoteNotArchivedException extends NoteDomainException {
  constructor(noteId: string) {
    super({ type: 'NoteNotArchived', message: 'Only an archived note can be restored', context: { noteId } });
  }
}

export class CannotShareWithSelfException extends NoteDomainException {
  constructor(noteId: string) {
    super({ type: 'CannotShareWithSelf', message: 'You already own this note', context: { noteId } });
  }
}

export class NoteAlreadySharedException extends NoteDomainException {
  constructor(noteId: string, recipientId: string) {
    super({
      type: 'NoteAlreadyShared',
      message: 'This note is already shared with that account',
      context: { noteId, recipientId },
    });
  }
}
