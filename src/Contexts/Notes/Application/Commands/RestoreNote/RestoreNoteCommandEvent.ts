import { CommandEvent } from '@SharedKernel/Domain';

export class RestoreNoteCommandEvent extends CommandEvent<{ noteId: string }> {}
