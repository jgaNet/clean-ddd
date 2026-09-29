import { IResult, Result } from '@Architecture/Domain';
import { CommandHandler, ExecutionContext } from '@Architecture/Application';

import { INoteRepository } from '@Contexts/Notes/Domain/Note/Ports/INoteRepository';
import { NoteNotFoundException } from '@Contexts/Notes/Domain/Note/NoteExceptions';
import { IBookmarkRepository } from '@Contexts/Notes/Domain/Bookmark/Ports/IBookmarkRepository';
import { NoteBookmarking } from '@Contexts/Notes/Domain/Bookmark/NoteBookmarking';
import { BookmarkNoteCommandEvent } from '@Contexts/Notes/Application/Commands/BookmarkNote/BookmarkNoteCommandEvent';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/**
 * Who is calling, load the note, hand it to the domain service that holds the rules spanning
 * note and bookmark (visible to the caller, at most once), save the new bookmark, publish what
 * it recorded. The note itself is not changed and not saved. Answers the bookmark's id, as
 * CreateNote answers the note's.
 */
export class BookmarkNoteCommandHandler extends CommandHandler<BookmarkNoteCommandEvent> {
  constructor(
    private noteRepository: INoteRepository,
    private bookmarkRepository: IBookmarkRepository,
    private noteBookmarking: NoteBookmarking,
  ) {
    super();
  }

  async execute({ payload }: BookmarkNoteCommandEvent, context: ExecutionContext): Promise<IResult<string>> {
    const reader = requireSignedIn(context, 'Notes');
    if (reader.isFailure()) return reader;

    const note = await this.noteRepository.findById(payload.noteId);
    if (!note) return Result.fail(new NoteNotFoundException(payload.noteId));

    const bookmark = await this.noteBookmarking.bookmark(note, reader.data);
    if (bookmark.isFailure()) return bookmark;

    const saved = await this.bookmarkRepository.save(bookmark.data);
    if (saved.isFailure()) return saved;
    this.publishDomainEvents(bookmark.data, context);

    return Result.ok(bookmark.data._id.value);
  }
}
