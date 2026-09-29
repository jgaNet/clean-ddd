import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';

import { IBookmarkRepository } from '@Contexts/Notes/Domain/Bookmark/Ports/IBookmarkRepository';
import { BookmarkNotFoundException } from '@Contexts/Notes/Domain/Bookmark/BookmarkExceptions';
import { RemoveBookmarkCommandEvent } from '@Contexts/Notes/Application/Commands/RemoveBookmark/RemoveBookmarkCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * Who is calling, load the caller's bookmark on that note, ask it to go, forget it, publish what
 * it recorded. The bookmark is found by (caller, note), so a stranger's bookmark is never even
 * loaded; the aggregate still checks the caller, because that rule is its own.
 */
export class RemoveBookmarkCommandHandler extends CommandHandler<RemoveBookmarkCommandEvent> {
  constructor(private bookmarkRepository: IBookmarkRepository) {
    super();
  }

  async execute({ payload }: RemoveBookmarkCommandEvent, context: ExecutionContext): Promise<IResult> {
    const reader = requireSignedIn(context, 'Notes');
    if (reader.isFailure()) return reader;

    const bookmark = await this.bookmarkRepository.findByAccountAndNote(reader.data.value, payload.noteId);
    if (!bookmark) return Result.fail(new BookmarkNotFoundException(payload.noteId, reader.data.value));

    const removed = bookmark.remove(reader.data);
    if (removed.isFailure()) return removed;

    const deleted = await this.bookmarkRepository.delete(bookmark);
    if (deleted.isFailure()) return deleted;
    this.publishDomainEvents(bookmark, context);

    return Result.ok();
  }
}
