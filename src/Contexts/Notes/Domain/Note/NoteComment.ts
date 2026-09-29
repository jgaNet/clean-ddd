import { Entity } from '@SharedKernel/Domain';
import { Id } from '@SharedKernel/Domain/ValueObjects';

import { INoteComment } from '@Contexts/Notes/Domain/Note/DTOs';
import { NoteCommentText } from '@Contexts/Notes/Domain/Note/NoteCommentText';

/**
 * NoteComment is an entity that is not an aggregate root, the way DeliveryAttempt is inside
 * Notification: it has its own identity (two identical texts from the same author are two
 * comments), but it exists only inside a Note, is created and reached through `Note.comment()`,
 * records no events of its own, and is persisted as part of the Note's snapshot. Who may
 * comment is the Note's rule, since only the Note knows whom it is shared with.
 */
export class NoteComment extends Entity {
  #authorId: Id;
  #text: NoteCommentText;
  #postedAt: Date;

  private constructor(id: Id, authorId: Id, text: NoteCommentText, postedAt: Date) {
    super(id);
    this.#authorId = authorId;
    this.#text = text;
    this.#postedAt = postedAt;
  }

  static create(authorId: Id, text: NoteCommentText, postedAt: Date): NoteComment {
    return new NoteComment(Id.generate(), authorId, text, postedAt);
  }

  /** Persisted text went through NoteCommentText already; a snapshot that fails it is corrupted. */
  static fromSnapshot(snapshot: INoteComment): NoteComment {
    const text = NoteCommentText.create(snapshot.text);
    if (text.isFailure()) {
      throw new Error(`Corrupted note comment ${snapshot._id}: ${text.error.message}`);
    }

    return new NoteComment(new Id(snapshot._id), new Id(snapshot.authorId), text.data, snapshot.postedAt);
  }

  toSnapshot(): INoteComment {
    return { _id: this._id.value, authorId: this.#authorId.value, text: this.#text.value, postedAt: this.#postedAt };
  }

  get authorId(): Id {
    return this.#authorId;
  }

  get text(): string {
    return this.#text.value;
  }

  get postedAt(): Date {
    return this.#postedAt;
  }
}
