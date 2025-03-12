import { Event } from '@Primitives';

interface ValidateAccountPayload {
  accountId: string;
}

export class ValidateAccountCommandEvent extends Event<ValidateAccountPayload> {}
