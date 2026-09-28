import { CommandEvent } from '@SharedKernel/Domain/Application';

export class RestoreNoteCommandEvent extends CommandEvent<{ noteId: string }> {}
