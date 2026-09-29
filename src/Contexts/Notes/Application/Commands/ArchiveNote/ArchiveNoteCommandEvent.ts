import { CommandEvent } from '@Architecture/Domain';

export class ArchiveNoteCommandEvent extends CommandEvent<{ noteId: string }> {}
