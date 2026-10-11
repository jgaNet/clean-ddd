import { CommandEvent } from '@Architecture/Domain';

interface LoginPayload {
  identifier: string; // the account's email; the field is named for what a login form calls it
  password: string;
}

export class LoginCommandEvent extends CommandEvent<LoginPayload> {}
