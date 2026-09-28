import { CommandEvent } from '@SharedKernel/Domain';

/** The password travels in clear inside the process only; it is hashed before anything is stored. */
export class SignUpCommandEvent extends CommandEvent<{ email: string; password: string }> {}
