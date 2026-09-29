import { AggregateRoot } from '@SharedKernel/Domain';
import { IResult, Result } from '@SharedKernel/Domain';
import { Id } from '@SharedKernel/Domain/ValueObjects';

import { INewNote, INote } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteStatus } from '@Contexts/Notes/Domain/Note/NoteStatus';
import { NoteTitle } from '@Contexts/Notes/Domain/Note/NoteTitle';
import {
  NoteCreatedEvent,
  NoteEditedEvent,
  NoteArchivedEvent,
  NoteRestoredEvent,
  NoteSharedEvent,
} from '@Contexts/Notes/Domain/Note/Events/NoteEvents';
import {
  CannotShareWithSelfException,
  NotNoteOwnerException,
  NoteAlreadyArchivedException,
  NoteAlreadySharedException,
  NoteArchivedException,
  NoteNotArchivedException,
} from '@Contexts/Notes/Domain/Note/NoteExceptions';

/**
 * Note is the aggregate root of the Notes context.
 *
 * Everything that can happen to a note goes through a method here, and every method
 * enforces the business rules before changing state:
 *
 * - a note always has a valid title (NoteTitle value object)
 * - only the owner can edit, archive, restore or share a note
 * - an archived note is read-only until it is restored: it can be neither edited nor shared
 *   (`ensureActive()`); archiving, restoring and reading it are not gated by that rule
 * - a note cannot be shared twice with the same account, nor with its owner
 *
 * The aggregate never touches persistence, logging or HTTP. It only knows business.
 */
export class Note extends AggregateRoot {
  #ownerId: Id;
  #title: NoteTitle;
  #content: string;
  #status: NoteStatus;
  #sharedWith: Set<string>; // raw ids: a Set needs a primitive key; the accessors speak Id

  private constructor(
    id: Id,
    ownerId: Id,
    title: NoteTitle,
    content: string,
    status: NoteStatus,
    sharedWith: string[],
  ) {
    super(id);
    this.#ownerId = ownerId;
    this.#title = title;
    this.#content = content;
    this.#status = status;
    this.#sharedWith = new Set(sharedWith);
  }

  /**
   * Writes a brand new note. This is the only way to bring a Note into existence.
   * The aggregate picks its own identity, so no persistence round-trip is needed first.
   */
  static create(props: INewNote): IResult<Note> {
    const title = NoteTitle.create(props.title);
    if (title.isFailure()) return title;

    const id = Id.generate();
    const note = new Note(id, new Id(props.ownerId), title.data, props.content, NoteStatus.ACTIVE, []);
    note.record(NoteCreatedEvent.set({ noteId: id.value, ownerId: props.ownerId, title: title.data.value }));

    return Result.ok(note);
  }

  /**
   * Rebuilds a Note from what was persisted. No event is recorded: nothing new happened.
   *
   * Persisted data has already been validated, so an invalid snapshot is a programming
   * error and throws instead of returning a Result. Trade-off to keep in mind: this
   * re-runs today's NoteTitle rules on yesterday's data. If a rule gets stricter (say
   * MAX_LENGTH shrinks), migrate existing notes before shipping it, or older notes will
   * refuse to load.
   */
  static fromSnapshot(snapshot: INote): Note {
    const title = NoteTitle.create(snapshot.title);
    if (title.isFailure()) {
      throw new Error(`Corrupted note ${snapshot._id}: ${title.error.message}`);
    }

    return new Note(
      new Id(snapshot._id),
      new Id(snapshot.ownerId),
      title.data,
      snapshot.content,
      snapshot.status,
      snapshot.sharedWith,
    );
  }

  edit(editorId: Id, changes: { title: string; content: string }): IResult {
    const allowed = this.ensureOwner(editorId);
    if (allowed.isFailure()) return allowed;

    const writable = this.ensureActive();
    if (writable.isFailure()) return writable;

    const title = NoteTitle.create(changes.title);
    if (title.isFailure()) return title;

    this.#title = title.data;
    this.#content = changes.content;
    this.record(NoteEditedEvent.set({ noteId: this._id.value, title: title.data.value }));

    return Result.ok();
  }

  archive(actorId: Id): IResult {
    const allowed = this.ensureOwner(actorId);
    if (allowed.isFailure()) return allowed;

    if (this.#status === NoteStatus.ARCHIVED) {
      return Result.fail(new NoteAlreadyArchivedException(this._id.value));
    }

    this.#status = NoteStatus.ARCHIVED;
    this.record(
      NoteArchivedEvent.set({
        noteId: this._id.value,
        title: this.#title.value,
        ownerId: this.#ownerId.value,
        sharedWith: [...this.#sharedWith],
      }),
    );

    return Result.ok();
  }

  restore(actorId: Id): IResult {
    const allowed = this.ensureOwner(actorId);
    if (allowed.isFailure()) return allowed;

    if (this.#status !== NoteStatus.ARCHIVED) {
      return Result.fail(new NoteNotArchivedException(this._id.value));
    }

    this.#status = NoteStatus.ACTIVE;
    this.record(NoteRestoredEvent.set({ noteId: this._id.value }));

    return Result.ok();
  }

  shareWith(actorId: Id, recipientId: Id): IResult {
    const allowed = this.ensureOwner(actorId);
    if (allowed.isFailure()) return allowed;

    const writable = this.ensureActive();
    if (writable.isFailure()) return writable;

    if (recipientId.equals(this.#ownerId)) {
      return Result.fail(new CannotShareWithSelfException(this._id.value));
    }

    if (this.#sharedWith.has(recipientId.value)) {
      return Result.fail(new NoteAlreadySharedException(this._id.value, recipientId.value));
    }

    this.#sharedWith.add(recipientId.value);
    this.record(
      NoteSharedEvent.set({
        noteId: this._id.value,
        title: this.#title.value,
        ownerId: this.#ownerId.value,
        recipientId: recipientId.value,
      }),
    );

    return Result.ok();
  }

  isVisibleTo(accountId: Id): boolean {
    return this.#ownerId.equals(accountId) || this.#sharedWith.has(accountId.value);
  }

  /** The plain data to persist. `fromSnapshot(note.toSnapshot())` gives back an equal note. */
  toSnapshot(): INote {
    return {
      _id: this._id.value,
      ownerId: this.#ownerId.value,
      title: this.#title.value,
      content: this.#content,
      status: this.#status,
      sharedWith: [...this.#sharedWith],
    };
  }

  private ensureOwner(actorId: Id): IResult {
    if (!this.#ownerId.equals(actorId)) {
      return Result.fail(new NotNoteOwnerException(this._id.value, actorId.value));
    }
    return Result.ok();
  }

  private ensureActive(): IResult {
    if (this.#status === NoteStatus.ARCHIVED) {
      return Result.fail(new NoteArchivedException(this._id.value));
    }
    return Result.ok();
  }

  get ownerId(): Id {
    return this.#ownerId;
  }

  get title(): string {
    return this.#title.value;
  }

  get content(): string {
    return this.#content;
  }

  get status(): NoteStatus {
    return this.#status;
  }

  get sharedWith(): string[] {
    return [...this.#sharedWith];
  }
}
