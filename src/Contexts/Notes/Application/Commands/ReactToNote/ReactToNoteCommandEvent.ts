import { CommandEvent } from '@Architecture/Domain';

/** The caller's reaction to a note: sending it again replaces the one they had left. */
export class ReactToNoteCommandEvent extends CommandEvent<{ noteId: string; emoji: string }> {}
