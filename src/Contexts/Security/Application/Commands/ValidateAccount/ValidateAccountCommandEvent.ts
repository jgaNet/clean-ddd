import { CommandEvent } from '@SharedKernel/Domain/Application';

interface ValidateAccountPayload {
  accountId: string;
}

export class ValidateAccountCommandEvent extends CommandEvent<ValidateAccountPayload> {}
