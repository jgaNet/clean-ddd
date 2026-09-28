import { Role } from '@SharedKernel/Domain';

import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';

export interface TokenPayload {
  subjectId: string;
  subjectType: TokenTypes | Role;
}

/** Issues and checks signed tokens. Implemented in the infrastructure (JwtService, with jose). */
export interface IJwtService {
  sign(payload: TokenPayload): Promise<string>;
  /** Returns the payload of a token whose signature and expiry check out, null otherwise. */
  verify(token: string): Promise<TokenPayload | null>;
}
