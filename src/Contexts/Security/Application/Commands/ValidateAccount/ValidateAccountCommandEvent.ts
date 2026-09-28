import { CommandEvent } from '@SharedKernel/Domain';
import { TokenPayload } from '@Contexts/Security/Domain/Auth/Ports/IJwtService';

export class ValidateAccountCommandEvent extends CommandEvent<TokenPayload> {}
