import { Event } from '@Primitives';

interface RegisterAdminPayload {
  identifier: string; // Could be email, username, etc.
  password: string;
}

export class RegisterAdminCommandEvent extends Event<RegisterAdminPayload> {}
