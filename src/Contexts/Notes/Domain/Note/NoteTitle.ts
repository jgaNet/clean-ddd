import { ValueObject } from '@SharedKernel/Domain/DDD';
import { IResult, Result } from '@SharedKernel/Domain/Application';
import { BlankNoteTitleException, NoteTitleTooLongException } from '@Contexts/Notes/Domain/Note/NoteExceptions';

/**
 * NoteTitle is a value object: it has no identity, it is immutable, and it cannot exist
 * in an invalid state. Once you hold a NoteTitle you know it is non-blank and short enough.
 *
 * The validation lives here, in one place, instead of being repeated wherever a title
 * enters the system (creation, edition, import...).
 */
export class NoteTitle extends ValueObject<string> {
  static readonly MAX_LENGTH = 100;

  private constructor(title: string) {
    super(title);
  }

  static create(raw: string): IResult<NoteTitle> {
    const title = raw.trim();

    if (title.length === 0) {
      return Result.fail(new BlankNoteTitleException());
    }

    if (title.length > NoteTitle.MAX_LENGTH) {
      return Result.fail(new NoteTitleTooLongException(NoteTitle.MAX_LENGTH, title.length));
    }

    return Result.ok(new NoteTitle(title));
  }
}
