import { CommandEvent } from '@Architecture/Domain';

export class ArchiveLinkCommandEvent extends CommandEvent<{ linkId: string }> {}
