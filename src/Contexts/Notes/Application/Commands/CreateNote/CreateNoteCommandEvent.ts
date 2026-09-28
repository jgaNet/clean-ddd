import { CommandEvent } from '@SharedKernel/Domain/Application';

export class CreateNoteCommandEvent extends CommandEvent<{ title: string; content: string }> {}
