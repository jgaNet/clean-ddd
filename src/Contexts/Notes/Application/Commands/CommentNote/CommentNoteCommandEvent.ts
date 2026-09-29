import { CommandEvent } from '@SharedKernel/Domain';

export class CommentNoteCommandEvent extends CommandEvent<{ noteId: string; text: string }> {}
