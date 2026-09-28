import { CommandEvent } from '@SharedKernel/Domain/Application';

export class EditNoteCommandEvent extends CommandEvent<{ noteId: string; title: string; content: string }> {}
