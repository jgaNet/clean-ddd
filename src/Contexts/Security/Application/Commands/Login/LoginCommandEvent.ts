import { CommandEvent } from '@SharedKernel/Domain/Application';

interface LoginPayload {
  identifier: string; // Could be email, username, etc.
  password: string;
}

export class LoginCommandEvent extends CommandEvent<LoginPayload> {}
