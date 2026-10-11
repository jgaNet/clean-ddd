import { Role } from '@SharedKernel/Domain';

import { TokenTypes } from '@Contexts/Security/Domain/Auth/TokenTypes';

export interface TokenPayload {
  subjectId: string;
  subjectType: TokenTypes | Role;
}

/**
 * Signed, expiring tokens that carry a subject and what the token is for (a session for a role,
 * a validation link). The domain says what a token must carry and that it cannot be forged; how
 * it is signed (JWT, jose, HS256) is the infrastructure's choice, in JoseSignedTokens.
 */
export interface ISignedTokens {
  issue(payload: TokenPayload): Promise<string>;
  /** Returns the payload of a token whose signature and expiry check out, null otherwise. */
  verify(token: string): Promise<TokenPayload | null>;
}
