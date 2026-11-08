import { CommandEvent } from '@Architecture/Domain';

export class SaveLinkCommandEvent extends CommandEvent<{ url: string; title: string }> {}
