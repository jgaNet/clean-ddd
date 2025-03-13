import { CommandEvent } from '@Primitives/Application';

interface RegisterAdminPayload {
  identifier: string; // Could be email, username, etc.
  password: string;
}

export class RegisterAdminCommandEvent extends CommandEvent<RegisterAdminPayload> {}
