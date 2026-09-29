import { CommandEvent } from '@Architecture/Domain';

/** Asks for a title for the note, from its content, and applies it if the note accepts it. */
export class SuggestNoteTitleCommandEvent extends CommandEvent<{ noteId: string }> {}
