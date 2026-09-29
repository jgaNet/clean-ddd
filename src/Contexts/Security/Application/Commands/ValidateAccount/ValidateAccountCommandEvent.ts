import { CommandEvent } from '@SharedKernel/Domain';

/**
 * Two ways to ask: with the token emailed at sign-up (anyone holding it), or by account id
 * (administrators only). The handler establishes which one applies from the caller and the
 * token itself; nothing in the payload is taken as proof of anything.
 */
export class ValidateAccountCommandEvent extends CommandEvent<{ accountId: string } | { validationToken: string }> {}
