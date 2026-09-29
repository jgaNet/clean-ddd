import { Exception } from '@Architecture/Domain';

/**
 * The broken rules of bookmarking, in business words; values carried by Result.fail(), never
 * thrown. A note that is not visible to the caller is refused with the note's own
 * NoteNotFoundException: as far as the caller knows, it does not exist.
 */
export class BookmarkDomainException extends Exception {
  constructor({ type, message, context }: { type: string; message: string; context?: unknown }) {
    super({ service: 'Notes', type, message, context });
  }
}

export class NoteAlreadyBookmarkedException extends BookmarkDomainException {
  constructor(noteId: string, accountId: string) {
    super({
      type: 'NoteAlreadyBookmarked',
      message: 'This note is already in your bookmarks',
      context: { noteId, accountId },
    });
  }
}

export class BookmarkNotFoundException extends BookmarkDomainException {
  constructor(noteId: string, accountId: string) {
    super({
      type: 'BookmarkNotFound',
      message: 'This note is not in your bookmarks',
      context: { noteId, accountId },
    });
  }
}

export class NotBookmarkOwnerException extends BookmarkDomainException {
  constructor(bookmarkId: string, actorId: string) {
    super({
      type: 'NotBookmarkOwner',
      message: 'Only the account that bookmarked a note can remove the bookmark',
      context: { bookmarkId, actorId },
    });
  }
}
