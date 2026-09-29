import { CommandEvent } from '@Architecture/Domain';

export class ShareNoteCommandEvent extends CommandEvent<{ noteId: string; recipientId: string }> {}
