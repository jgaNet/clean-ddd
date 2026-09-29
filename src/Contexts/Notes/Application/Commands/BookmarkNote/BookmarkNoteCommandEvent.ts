import { CommandEvent } from '@Architecture/Domain';

export class BookmarkNoteCommandEvent extends CommandEvent<{ noteId: string }> {}
