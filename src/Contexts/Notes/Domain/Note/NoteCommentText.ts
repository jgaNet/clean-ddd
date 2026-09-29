import { ValueObject } from '@SharedKernel/Domain';
import { IResult, Result } from '@SharedKernel/Domain';
import { BlankNoteCommentException, NoteCommentTooLongException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/**
 * NoteCommentText is the body of a comment: a value object, like NoteTitle, so that a
 * comment can never hold a blank or over-long text. The one rule the product stated
 * (at most 500 characters) lives here and nowhere else.
 */
export class NoteCommentText extends ValueObject<string> {
  static readonly MAX_LENGTH = 500;

  private constructor(text: string) {
    super(text);
  }

  static create(raw: string): IResult<NoteCommentText> {
    const text = raw.trim();

    if (text.length === 0) {
      return Result.fail(new BlankNoteCommentException());
    }

    if (text.length > NoteCommentText.MAX_LENGTH) {
      return Result.fail(new NoteCommentTooLongException(NoteCommentText.MAX_LENGTH, text.length));
    }

    return Result.ok(new NoteCommentText(text));
  }
}
