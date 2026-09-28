import { CommandEvent } from '@SharedKernel/Domain';

export class ShareNoteCommandEvent extends CommandEvent<{ noteId: string; recipientId: string }> {}
