import { CommandEvent } from '@SharedKernel/Domain';

export class RetagNoteCommandEvent extends CommandEvent<{ noteId: string; tags: string[] }> {}
