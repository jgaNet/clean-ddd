import { CommandEvent } from '@Architecture/Domain';

export class EditNoteCommandEvent extends CommandEvent<{ noteId: string; title: string; content: string }> {}
