import { SignJWT, jwtVerify } from 'jose';

import { ISignedTokens, TokenPayload } from '@Contexts/Security/Domain/Auth/Ports/ISignedTokens';

export interface SignedTokensConfig {
  secret: string;
  /** e.g. '24h', '15m' */
  expiresIn: string;
}

/** The ISignedTokens port as HS256 JSON Web Tokens signed with a shared secret (jose). `verify` rejects a bad signature or an expired token. */
export class JoseSignedTokens implements ISignedTokens {
  #key: Uint8Array;
  #expiresIn: string;

  constructor({ secret, expiresIn }: SignedTokensConfig) {
    this.#key = new TextEncoder().encode(secret);
    this.#expiresIn = expiresIn;
  }

  issue(payload: TokenPayload): Promise<string> {
    return new SignJWT({ subjectId: payload.subjectId, subjectType: payload.subjectType })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(this.#expiresIn)
      .sign(this.#key);
  }

  async verify(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.#key, { algorithms: ['HS256'] });
      const { subjectId, subjectType } = payload as Partial<TokenPayload>;
      if (!subjectId || !subjectType) return null;

      return { subjectId, subjectType };
    } catch {
      return null;
    }
  }
}
