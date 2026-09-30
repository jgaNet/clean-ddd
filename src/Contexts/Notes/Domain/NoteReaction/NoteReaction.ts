import { AggregateRoot, Id, IResult, Result } from '@Architecture/Domain';

import { INewNoteReaction, INoteReaction } from '@Contexts/Notes/Domain/NoteReaction/DTOs';
import { ReactionEmoji } from '@Contexts/Notes/Domain/NoteReaction/ReactionEmoji';
import {
  NoteReactedEvent,
  NoteReactionChangedEvent,
} from '@Contexts/Notes/Domain/NoteReaction/Events/NoteReactionEvents';
import {
  NotYourReactionException,
  ReactionUnchangedException,
} from '@Contexts/Notes/Domain/NoteReaction/NoteReactionExceptions';

/**
 * NoteReaction is how one person reacted to one note, and it is an aggregate of its own
 * rather than a part of the Note: it is written by the people the note is shared with, not by
 * its owner, and two of them reacting at the same time must not fight over the note's version.
 * It points at the note by id and holds nothing of it.
 *
 * The rules that live here are the ones a single reaction can check: the emoji is one the
 * product supports, and only the person who reacted changes their reaction, to something else.
 * Who may react to a given note at all is the Note's rule (Note.allowsReactionFrom), and
 * "one reaction per person per note" is a rule about the collection, held by NoteReacting.
 */
export class NoteReaction extends AggregateRoot {
  #noteId: Id;
  #reactorId: Id;
  #emoji: ReactionEmoji;
  #reactedAt: Date;

  private constructor(id: Id, noteId: Id, reactorId: Id, emoji: ReactionEmoji, reactedAt: Date, version: number = 0) {
    super(id, version);
    this.#noteId = noteId;
    this.#reactorId = reactorId;
    this.#emoji = emoji;
    this.#reactedAt = reactedAt;
  }

  /**
   * Records a person's first reaction to a note. The moment is a parameter with a default, so
   * the same call in a test is reproducible; the identity is the domain's own (ADR 2).
   */
  static create(props: INewNoteReaction, at: Date = new Date()): IResult<NoteReaction> {
    const emoji = ReactionEmoji.create(props.emoji);
    if (emoji.isFailure()) return emoji;

    const id = Id.generate();
    const reaction = new NoteReaction(id, new Id(props.noteId), new Id(props.reactorId), emoji.data, at);
    reaction.record(
      NoteReactedEvent.set({
        reactionId: id.value,
        noteId: props.noteId,
        reactorId: props.reactorId,
        emoji: emoji.data.value,
        firstOnNote: props.firstOnNote,
      }),
    );

    return Result.ok(reaction);
  }

  /** Rebuilds a reaction from what was persisted: nothing happened, so nothing is recorded. */
  static fromSnapshot(snapshot: INoteReaction): NoteReaction {
    const emoji = ReactionEmoji.create(snapshot.emoji);
    if (emoji.isFailure()) {
      throw new Error(`Corrupted note reaction ${snapshot._id}: ${emoji.error.message}`);
    }

    return new NoteReaction(
      new Id(snapshot._id),
      new Id(snapshot.noteId),
      new Id(snapshot.reactorId),
      emoji.data,
      snapshot.reactedAt,
      snapshot.version,
    );
  }

  /**
   * A person changes their mind. The reaction keeps its identity and its date, so a note's
   * reactions stay in the order people first reacted.
   */
  changeTo(actorId: Id, rawEmoji: string): IResult {
    if (!this.#reactorId.equals(actorId)) {
      return Result.fail(new NotYourReactionException(this._id.value, actorId.value));
    }

    const emoji = ReactionEmoji.create(rawEmoji);
    if (emoji.isFailure()) return emoji;

    if (emoji.data.equals(this.#emoji)) {
      return Result.fail(new ReactionUnchangedException(this._id.value, emoji.data.value));
    }

    this.#emoji = emoji.data;
    this.record(
      NoteReactionChangedEvent.set({
        reactionId: this._id.value,
        noteId: this.#noteId.value,
        reactorId: this.#reactorId.value,
        emoji: emoji.data.value,
      }),
    );

    return Result.ok();
  }

  /** The plain data to persist. `fromSnapshot(reaction.toSnapshot())` gives back an equal one. */
  toSnapshot(): INoteReaction {
    return {
      _id: this._id.value,
      noteId: this.#noteId.value,
      reactorId: this.#reactorId.value,
      emoji: this.#emoji.value,
      reactedAt: this.#reactedAt,
      version: this.version,
    };
  }

  get noteId(): Id {
    return this.#noteId;
  }

  get reactorId(): Id {
    return this.#reactorId;
  }

  get emoji(): string {
    return this.#emoji.value;
  }

  get reactedAt(): Date {
    return this.#reactedAt;
  }
}
