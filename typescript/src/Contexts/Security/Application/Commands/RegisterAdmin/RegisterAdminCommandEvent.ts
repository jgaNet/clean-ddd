import { CommandEvent } from '@Architecture/Domain';

export class RegisterAdminCommandEvent extends CommandEvent<{ email: string; password: string }> {}
