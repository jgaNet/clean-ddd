import { CommandEvent } from '@SharedKernel/Domain';

export class CreateNoteCommandEvent extends CommandEvent<{ title: string; content: string; tags?: string[] }> {}
