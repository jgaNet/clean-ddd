import { CommandEvent } from '@Primitives/Application';

interface ValidateAccountPayload {
  accountId: string;
}

export class ValidateAccountCommandEvent extends CommandEvent<ValidateAccountPayload> {}
