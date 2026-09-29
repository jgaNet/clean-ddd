import { ValueObject } from '@SharedKernel/Domain';
import { IResult, Result } from '@SharedKernel/Domain';
import { InvalidNoteTagException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/**
 * NoteTag is a value object: one tag on a note. Once you hold one you know it is 2 to 20
 * characters of lowercase letters and digits, nothing else.
 *
 * The rule about one tag lives here; the rules about the set of tags on a note (at most
 * five, no duplicates) are the aggregate's invariants, checked in Note.
 */
export class NoteTag extends ValueObject<string> {
  static readonly MIN_LENGTH = 2;
  static readonly MAX_LENGTH = 20;
  static readonly FORMAT = /^[a-z0-9]+$/;

  private constructor(tag: string) {
    super(tag);
  }

  static create(raw: string): IResult<NoteTag> {
    const tag = raw.trim();

    if (tag.length < NoteTag.MIN_LENGTH || tag.length > NoteTag.MAX_LENGTH || !NoteTag.FORMAT.test(tag)) {
      return Result.fail(new InvalidNoteTagException(raw, NoteTag.MIN_LENGTH, NoteTag.MAX_LENGTH));
    }

    return Result.ok(new NoteTag(tag));
  }
}
