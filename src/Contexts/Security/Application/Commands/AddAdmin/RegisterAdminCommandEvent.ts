import { CommandEvent } from '@SharedKernel/Domain/Application';

interface RegisterAdminPayload {
  identifier: string; // Could be email, username, etc.
  password: string;
}

export class RegisterAdminCommandEvent extends CommandEvent<RegisterAdminPayload> {}
