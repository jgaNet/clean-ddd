import { CommandEvent } from '@SharedKernel/Domain';

export class UnpinNoteCommandEvent extends CommandEvent<{ noteId: string }> {}
