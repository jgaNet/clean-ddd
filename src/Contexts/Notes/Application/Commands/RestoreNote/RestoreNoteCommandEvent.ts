import { CommandEvent } from '@Architecture/Domain';

export class RestoreNoteCommandEvent extends CommandEvent<{ noteId: string }> {}
