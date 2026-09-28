import { CommandEvent } from '@SharedKernel/Domain';

export class EditNoteCommandEvent extends CommandEvent<{ noteId: string; title: string; content: string }> {}
