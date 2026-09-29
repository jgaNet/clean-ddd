import { CommandEvent } from '@Architecture/Domain';

export class CreateNoteCommandEvent extends CommandEvent<{ title: string; content: string }> {}
