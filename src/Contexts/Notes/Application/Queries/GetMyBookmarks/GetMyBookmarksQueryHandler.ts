import { IResult, Result } from '@Architecture/Domain';
import { ExecutionContext, QueryHandler } from '@Architecture/Application';

import { BookmarkListItem, IBookmarkQueries } from '@Contexts/Notes/Domain/Bookmark/Ports/IBookmarkQueries';
import { requireSignedIn } from '@SharedKernel/Application/Guards';

/** The caller's own bookmarks, in the order the port promises (most recent first); no sorting here. */
export class GetMyBookmarksQueryHandler extends QueryHandler<IBookmarkQueries, void, IResult<BookmarkListItem[]>> {
  async execute(_: void, context: ExecutionContext): Promise<IResult<BookmarkListItem[]>> {
    const reader = requireSignedIn(context, 'Notes');
    if (reader.isFailure()) return reader;

    return Result.ok(await this.queries.findByAccount(reader.data.value));
  }
}
