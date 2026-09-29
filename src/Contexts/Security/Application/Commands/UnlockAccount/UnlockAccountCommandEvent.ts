import { CommandEvent } from '@SharedKernel/Domain';

export class UnlockAccountCommandEvent extends CommandEvent<{ accountId: string }> {}
