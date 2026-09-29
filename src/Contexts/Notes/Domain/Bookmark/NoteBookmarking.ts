import { Id, IResult, Result } from '@Architecture/Domain';

import { Note } from '@Contexts/Notes/Domain/Note/Note';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { Bookmark } from '@Contexts/Notes/Domain/Bookmark/Bookmark';
import { IBookmarkRepository } from '@Contexts/Notes/Domain/Bookmark/Ports/IBookmarkRepository';
import { NoteAlreadyBookmarkedException } from '@Contexts/Notes/Domain/Bookmark/BookmarkExceptions';

/**
 * NoteBookmarking is a domain service: the two rules of bookmarking span more than the Bookmark
 * aggregate, so neither can be checked by it alone.
 *
 * - "only a note the reader can see": a fact about the Note, which is another aggregate, so the
 *   note is handed in. A note the reader cannot see is refused as not found: as far as the reader
 *   knows, it does not exist (the same answer GetNote gives).
 * - "a note is in an account's bookmarks at most once": a fact about the whole collection of
 *   bookmarks, asked of the repository, on the write side.
 *
 * Still pure domain: it depends on the port, not on an implementation, and carries no
 * application concern.
 */
export class NoteBookmarking {
  constructor(private bookmarks: IBookmarkRepository) {}

  async bookmark(note: Note, reader: Id, now: Date = new Date()): Promise<IResult<Bookmark>> {
    if (!note.isVisibleTo(reader)) {
      return Result.fail(new NoteNotFoundException(note._id.value));
    }

    if (await this.bookmarks.findByAccountAndNote(reader.value, note._id.value)) {
      return Result.fail(new NoteAlreadyBookmarkedException(note._id.value, reader.value));
    }

    return Result.ok(Bookmark.create({ accountId: reader.value, noteId: note._id.value }, now));
  }
}
