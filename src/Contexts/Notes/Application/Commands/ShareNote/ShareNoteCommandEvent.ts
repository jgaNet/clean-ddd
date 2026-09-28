import { CommandEvent } from '@SharedKernel/Domain/Application';

export class ShareNoteCommandEvent extends CommandEvent<{ noteId: string; recipientId: string }> {}
