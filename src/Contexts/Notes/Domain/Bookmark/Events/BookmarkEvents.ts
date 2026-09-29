import { DomainEvent } from '@Architecture/Domain';

/**
 * The facts a Bookmark records, in the past tense. Nothing reacts to them yet: they are
 * recorded because they happened, the Tracker keeps them, and a handler can be subscribed
 * later without touching the aggregate.
 */

export class NoteBookmarkedEvent extends DomainEvent<{ bookmarkId: string; noteId: string; accountId: string }> {}

export class BookmarkRemovedEvent extends DomainEvent<{ bookmarkId: string; noteId: string; accountId: string }> {}
