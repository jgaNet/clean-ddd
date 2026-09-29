import { CommandEvent } from '@SharedKernel/Domain';

export class RegisterAdminCommandEvent extends CommandEvent<{ email: string; password: string }> {}
