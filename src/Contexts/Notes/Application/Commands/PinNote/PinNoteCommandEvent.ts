import { CommandEvent } from '@SharedKernel/Domain';

export class PinNoteCommandEvent extends CommandEvent<{ noteId: string }> {}
