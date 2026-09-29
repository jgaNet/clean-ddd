import { CommandEvent } from '@Architecture/Domain';

/** Named by the note: an account holds at most one bookmark per note, so the pair identifies it. */
export class RemoveBookmarkCommandEvent extends CommandEvent<{ noteId: string }> {}
