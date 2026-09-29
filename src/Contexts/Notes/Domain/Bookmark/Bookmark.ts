import { AggregateRoot, Id, IResult, Result } from '@Architecture/Domain';

import { IBookmark, INewBookmark } from '@Contexts/Notes/Domain/Bookmark/DTOs';
import { BookmarkRemovedEvent, NoteBookmarkedEvent } from '@Contexts/Notes/Domain/Bookmark/Events/BookmarkEvents';
import { NotBookmarkOwnerException } from '@Contexts/Notes/Domain/Bookmark/BookmarkExceptions';

/**
 * Bookmark is the second aggregate of the Notes context: one account keeping one note at hand.
 *
 * It is its own aggregate, not a list inside Note: bookmarks are written by the note's readers,
 * not by its owner, they grow without bound, and they need not be consistent with the note in
 * the same transaction. So a Bookmark references the note by id, and the rules that span both
 * (the note must be visible to the reader, at most one bookmark per note and account) live in
 * the NoteBookmarking domain service.
 *
 * What the aggregate enforces alone: only the account that bookmarked a note can remove the
 * bookmark.
 */
export class Bookmark extends AggregateRoot {
  #accountId: Id;
  #noteId: Id;
  #createdAt: Date;

  private constructor(id: Id, accountId: Id, noteId: Id, createdAt: Date, version: number = 0) {
    super(id, version);
    this.#accountId = accountId;
    this.#noteId = noteId;
    this.#createdAt = createdAt;
  }

  /**
   * Bookmarks a note. Nothing here can be invalid (two ids and a time), so it returns the
   * aggregate itself rather than a Result; what can be refused (visibility, at most once)
   * is NoteBookmarking's business. Time is a parameter with a default, so a test can fix it.
   */
  static create(props: INewBookmark, now: Date = new Date()): Bookmark {
    const id = Id.generate();
    const bookmark = new Bookmark(id, new Id(props.accountId), new Id(props.noteId), now);
    bookmark.record(
      NoteBookmarkedEvent.set({ bookmarkId: id.value, noteId: props.noteId, accountId: props.accountId }),
    );

    return bookmark;
  }

  /** Rebuilds a Bookmark from what was persisted; records nothing, throws on corrupted data. */
  static fromSnapshot(snapshot: IBookmark): Bookmark {
    if (!snapshot.accountId || !snapshot.noteId || Number.isNaN(snapshot.createdAt.getTime())) {
      throw new Error(`Corrupted bookmark ${snapshot._id}`);
    }

    return new Bookmark(
      new Id(snapshot._id),
      new Id(snapshot.accountId),
      new Id(snapshot.noteId),
      snapshot.createdAt,
      snapshot.version,
    );
  }

  /**
   * The bookmark ceases to exist: the aggregate checks who asks and records the fact; the
   * repository forgets it (`delete`) once the handler has asked.
   */
  remove(actorId: Id): IResult {
    if (!this.#accountId.equals(actorId)) {
      return Result.fail(new NotBookmarkOwnerException(this._id.value, actorId.value));
    }

    this.record(
      BookmarkRemovedEvent.set({
        bookmarkId: this._id.value,
        noteId: this.#noteId.value,
        accountId: this.#accountId.value,
      }),
    );

    return Result.ok();
  }

  /** The plain data to persist. `fromSnapshot(bookmark.toSnapshot())` gives back an equal bookmark. */
  toSnapshot(): IBookmark {
    return {
      _id: this._id.value,
      accountId: this.#accountId.value,
      noteId: this.#noteId.value,
      createdAt: this.#createdAt,
      version: this.version,
    };
  }

  get accountId(): Id {
    return this.#accountId;
  }

  get noteId(): Id {
    return this.#noteId;
  }

  get createdAt(): Date {
    return this.#createdAt;
  }
}
