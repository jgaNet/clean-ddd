import { CommandEvent } from '@SharedKernel/Domain/Application';

export class ArchiveNoteCommandEvent extends CommandEvent<{ noteId: string }> {}
