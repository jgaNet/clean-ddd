import { CommandEvent } from '@SharedKernel/Domain';

export class ArchiveNoteCommandEvent extends CommandEvent<{ noteId: string }> {}
