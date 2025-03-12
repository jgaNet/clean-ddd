import { Event } from '@Primitives';

interface LoginPayload {
  identifier: string; // Could be email, username, etc.
  password: string;
}

export class LoginCommandEvent extends Event<LoginPayload> {}
