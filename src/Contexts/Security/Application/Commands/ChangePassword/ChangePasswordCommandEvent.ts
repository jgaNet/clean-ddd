import { CommandEvent } from '@Architecture/Domain';

/**
 * No account id: a user changes their own password, and the handler takes the account from
 * the caller. Both passwords travel in clear inside the process only; the new one is hashed
 * before anything is stored, and the Tracker keeps no payload.
 */
export class ChangePasswordCommandEvent extends CommandEvent<{ currentPassword: string; newPassword: string }> {}
